import { apiDetectFields, getSession } from '../api'
import { isFieldType } from '../types'
import type { DetectedField, FieldDetectionResult } from '../types'

/* ── Response validation ──────────────────────────────────────────────
   The backend wraps a VLM; never trust its JSON blindly. Coerce every
   entry into the DetectedField contract or drop it. */

interface RawBBox {
  x: number
  y: number
  width: number
  height: number
}

function coerceBBox(raw: unknown): RawBBox | null {
  if (Array.isArray(raw) && raw.length >= 4) {
    const [x, y, w, h] = raw.map(Number)
    if ([x, y, w, h].every((n) => Number.isFinite(n)) && w > 0 && h > 0) {
      return { x, y, width: w, height: h }
    }
    return null
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>
    const x = Number(rec.x)
    const y = Number(rec.y)
    const w = Number(rec.width)
    const h = Number(rec.height)
    if ([x, y, w, h].every((n) => Number.isFinite(n)) && w > 0 && h > 0) {
      return { x, y, width: w, height: h }
    }
  }
  return null
}

export function coerceDetectedFields(rawFields: unknown): DetectedField[] {
  if (!Array.isArray(rawFields)) return []
  const out: DetectedField[] = []
  for (const item of rawFields) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const bbox = coerceBBox(rec.bbox ?? rec.boundingBox)
    if (!bbox) continue

    let fieldType: DetectedField['fieldType']
    if (isFieldType(rec.fieldType)) fieldType = rec.fieldType
    else if (isFieldType(rec.field_type)) fieldType = rec.field_type
    else if (rec.fieldType === 'text' || rec.field_type === 'text') fieldType = 'text_line'
    else continue

    // A radio entry without a group id gets one derived from its label so
    // downstream grouping logic still works.
    let groupId: string | undefined
    const rawGroup =
      typeof rec.groupId === 'string' ? rec.groupId : typeof rec.group_id === 'string' ? rec.group_id : ''
    if (fieldType === 'radio') {
      groupId = rawGroup || `group_${rec.label || out.length}`
    }

    const confidenceRaw = Number(rec.confidence)
    out.push({
      id: typeof rec.id === 'string' && rec.id ? rec.id : `field_${out.length}`,
      label: typeof rec.label === 'string' ? rec.label.trim() : '',
      fieldType,
      bbox,
      ...(groupId ? { groupId } : {}),
      confidence: Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0.6,
      source: 'vlm',
    })
  }
  return out
}

/**
 * Tier 1 — structured field detection via the Snappy backend, which wraps a
 * self-hosted vision model (PaddleOCR-VL / DeepSeek-OCR). Throws on any
 * failure (unreachable, timeout, bad payload) so the orchestrator can fall
 * through to the on-device OpenCV tier — same pattern as the OCR chain.
 */
export async function detectFieldsViaBackendVLM(
  imageBlob: Blob,
  pageWidth: number,
  pageHeight: number
): Promise<FieldDetectionResult> {
  const session = getSession()
  const raw = await apiDetectFields(
    session?.token ?? null,
    imageBlob,
    'page.jpg',
    15000
  )

  if (!raw || typeof raw !== 'object') {
    throw new Error('Field detection returned an invalid payload')
  }
  const rec = raw as Record<string, unknown>
  const fields = coerceDetectedFields(rec.fields)

  const warnings = Array.isArray(rec.warnings)
    ? rec.warnings.filter((w): w is string => typeof w === 'string')
    : []

  // Trust explicit dimensions from the backend when sane; else use ours
  const bw = Number(rec.pageWidth)
  const bh = Number(rec.pageHeight)

  return {
    pageWidth: Number.isFinite(bw) && bw > 0 ? bw : pageWidth,
    pageHeight: Number.isFinite(bh) && bh > 0 ? bh : pageHeight,
    fields,
    tierUsed: 'vlm',
    warnings,
  }
}
