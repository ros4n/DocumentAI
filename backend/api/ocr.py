import io
import logging

import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 25 * 1024 * 1024
MAX_PDF_PAGES = 15

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR

        _engine = RapidOCR()
    return _engine


def recognize_image(data: bytes) -> str:
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img).convert('RGB')
        result, _ = get_engine()(np.array(img))
    if not result:
        return ''
    return '\n'.join(str(line[1]) for line in result).strip()


def recognize_pdf(data: bytes):
    try:
        import pymupdf
    except ImportError:
        import fitz as pymupdf

    doc = pymupdf.open(stream=data, filetype='pdf')
    page_texts = []
    for index, page in enumerate(doc):
        if index >= MAX_PDF_PAGES:
            break
        text = page.get_text('text').strip()
        if not text:
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
            text = recognize_image(pix.tobytes('jpeg', quality=90))
        page_texts.append(text)
    doc.close()
    return page_texts