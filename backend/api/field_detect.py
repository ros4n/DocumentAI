"""Structured form-field detection via a self-hosted vision model.

Wraps an OpenAI-compatible vision endpoint (PaddleOCR-VL or DeepSeek-OCR
served through vLLM / SGLang / Transformers) behind one endpoint:

    POST /api/documents/detect-fields   (multipart: image=<file>)

Returns the unified FieldDetectionResult contract consumed by the
frontend's fieldDetect pipeline. If no model is configured the view
returns 503 and the client falls back to its on-device OpenCV tier.
"""

import base64
import hashlib
import json
import logging
import re
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 20
MAX_FILE_SIZE = 25 * 1024 * 1024
CACHE_MAX_ENTRIES = 128

# Spec §4.3 prompt template (verbatim)
DETECTION_PROMPT = """You are analyzing a blank/unfilled form page. Identify every fillable field on the page.

For each field, return:
- "label": the nearest descriptive text that tells a person what to enter (e.g. "Full Name", "Date of Birth", "Male", "Female", "I agree to the terms")
- "field_type": one of "text_line", "checkbox", "radio", "signature", "date"
- "bbox": pixel coordinates [x, y, width, height] of the FILLABLE AREA ONLY (the blank line, empty box, or empty circle) — NOT the label text itself
- "group_id": if this is a radio button that is part of a set of mutually exclusive options (e.g. Male/Female, Yes/No), give all options in that set the same group_id string. Omit for checkboxes and text fields.
- "confidence": your confidence from 0 to 1 that this is correctly identified

Rules:
- Do not include already-filled-in fields' content, only detect the blank field locations.
- If a checkbox or radio circle has no visible label immediately next to it, look for a question or header above the group of options and use that as context in the label (e.g. "Marital Status: Single").
- Distinguish signature lines from generic text lines when the word "Signature" or "Sign here" appears nearby.
- Return ONLY valid JSON, no markdown code fences, no explanation text, in this shape:
  { "fields": [ { "label": "...", "field_type": "...", "bbox": [x,y,w,h], "group_id": "...", "confidence": 0.0 } ] }"""

VALID_FIELD_TYPES = {
    'text_line',
    'checkbox',
    'radio',
    'signature',
    'date',
}

_cache: dict[str, dict] = {}
_cache_order: list[str] = []


def _setting(name: str, default: str = '') -> str:
    return str(getattr(settings, name, default) or default)


def vlm_configured() -> bool:
    return bool(_setting('FIELD_DETECT_VLM_URL') and _setting('FIELD_DETECT_VLM_MODEL'))


def _cache_get(key: str):
    return _cache.get(key)


def _cache_put(key: str, value: dict) -> None:
    if key in _cache:
        return
    _cache[key] = value
    _cache_order.append(key)
    while len(_cache_order) > CACHE_MAX_ENTRIES:
        oldest = _cache_order.pop(0)
        _cache.pop(oldest, None)


def _extract_json(text: str):
    """Pull the JSON object out of a model reply (handles code fences /
    leading prose). Returns None when nothing parseable exists."""
    cleaned = re.sub(r'```(?:json)?', '', text).strip()
    start = cleaned.find('{')
    if start == -1:
        return None
    try:
        return json.loads(cleaned[start:])
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    idx = start
    while idx != -1:
        try:
            obj, _ = decoder.raw_decode(cleaned[idx:])
            return obj
        except json.JSONDecodeError:
            idx = cleaned.find('{', idx + 1)
    return None


def _coerce_bbox(raw):
    if isinstance(raw, dict):
        try:
            x = float(raw['x'])
            y = float(raw['y'])
            w = float(raw['width'])
            h = float(raw['height'])
        except (KeyError, TypeError, ValueError):
            return None
    elif isinstance(raw, (list, tuple)) and len(raw) >= 4:
        try:
            x, y, w, h = (float(v) for v in raw[:4])
        except (TypeError, ValueError):
            return None
    else:
        return None
    if w <= 0 or h <= 0:
        return None
    return {'x': round(x), 'y': round(y), 'width': round(w), 'height': round(h)}


def _coerce_fields(raw_fields):
    fields = []
    if not isinstance(raw_fields, list):
        return fields
    for index, item in enumerate(raw_fields):
        if not isinstance(item, dict):
            continue
        bbox = _coerce_bbox(item.get('bbox') or item.get('boundingBox'))
        if bbox is None:
            continue
        field_type = str(item.get('field_type') or item.get('fieldType') or '').strip()
        if field_type == 'text':
            field_type = 'text_line'
        if field_type not in VALID_FIELD_TYPES:
            continue
        label = str(item.get('label') or '').strip()
        group_id = str(item.get('group_id') or item.get('groupId') or '').strip()
        try:
            confidence = max(0.0, min(1.0, float(item.get('confidence', 0.6))))
        except (TypeError, ValueError):
            confidence = 0.6
        field = {
            'id': str(item.get('id') or f'field_{index}'),
            'label': label,
            'fieldType': field_type,
            'bbox': bbox,
            'confidence': round(confidence, 3),
            'source': 'vlm',
        }
        if field_type == 'radio':
            field['groupId'] = group_id or f"group_{index}"
        fields.append(field)
    return fields


class FieldDetectionError(Exception):
    """Raised when the upstream VLM call fails; message is user-safe."""


def detect_fields_in_image(data: bytes, content_type: str) -> dict:
    """Call the configured VLM and return the FieldDetectionResult dict."""
    base_url = _setting('FIELD_DETECT_VLM_URL').rstrip('/')
    model = _setting('FIELD_DETECT_VLM_MODEL')
    api_key = _setting('FIELD_DETECT_VLM_API_KEY')

    cache_key = hashlib.md5(data).hexdigest()
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    mime = content_type or 'image/jpeg'
    data_uri = f'data:{mime};base64,{base64.b64encode(data).decode("ascii")}'

    payload = {
        'model': model,
        'messages': [
            {
                'role': 'user',
                'content': [
                    {'type': 'image_url', 'image_url': {'url': data_uri}},
                    {'type': 'text', 'text': DETECTION_PROMPT},
                ],
            }
        ],
        'max_tokens': 4096,
        'temperature': 0,
    }

    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    req = urllib.request.Request(
        f'{base_url}/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        raise FieldDetectionError(f'VLM returned HTTP {exc.code}') from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FieldDetectionError(f'VLM unreachable: {exc}') from exc
    except json.JSONDecodeError as exc:
        raise FieldDetectionError('VLM returned a malformed response') from exc

    try:
        content = body['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError) as exc:
        raise FieldDetectionError('VLM response missing message content') from exc
    if isinstance(content, list):
        # Some servers return segmented content parts
        content = ''.join(
            part.get('text', '') for part in content if isinstance(part, dict)
        )

    parsed = _extract_json(content if isinstance(content, str) else '')
    if not parsed or not isinstance(parsed, dict):
        raise FieldDetectionError('VLM did not return valid JSON')

    fields = _coerce_fields(parsed.get('fields'))

    from PIL import Image
    import io

    with Image.open(io.BytesIO(data)) as img:
        width, height = img.size

    warnings: list[str] = []
    unlabeled = sum(1 for f in fields if not f['label'])
    if unlabeled:
        warnings.append(f'{unlabeled} field(s) had no readable label')
    low_conf = sum(1 for f in fields if f['confidence'] < 0.5)
    if low_conf:
        warnings.append(f'{low_conf} field(s) below 0.5 confidence — review before filling')

    result = {
        'pageWidth': width,
        'pageHeight': height,
        'fields': fields,
        'tierUsed': 'vlm',
        'warnings': warnings,
    }
    _cache_put(cache_key, result)
    return result
