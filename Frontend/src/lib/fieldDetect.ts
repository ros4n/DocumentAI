/* ============================================================
   Field-detection pipeline orchestrator (Section 6).

   Unified entry point for image AND pdf input:

     PDF ──► rasterize page ──► TIER 0 AcroForm (pdf-lib)
                                  │ zero fields?
                                  ▼
     image ────────────────► TIER 1 backend VLM (15s timeout)
                                  │ unreachable / invalid?
                                  ▼
                              TIER 2 on-device OpenCV.js

   Every tier emits the same DetectedField[] contract from
   lib/types.ts — downstream never knows which tier ran.
   ============================================================ */

import { getPdfPageCount, rasterizePdfPages } from './ocr'
import { detectFieldsViaBackendVLM } from './fieldDetect/vlmBackend'
import { detectFieldsViaOpenCV } from './fieldDetect/opencvFallback'
import type { FieldDetectionResult } from './types'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the capture'))
    reader.readAsDataURL(blob)
  })
}

export interface DetectionWithImage {
  detection: FieldDetectionResult
  /** Rasterized page / source image — same coordinate space as `detection` */
  imageDataUrl: string
}

/**
 * Core pipeline over a known rasterized page. `imageBlob` is uploaded to the
 * Tier 1 backend; `imageDataUrl` drives the Tier 2 OpenCV pass locally.
 */
async function runPipeline(
  imageBlob: Blob,
  imageDataUrl: string,
  pageWidth: number,
  pageHeight: number
): Promise<FieldDetectionResult> {
  try {
    return await detectFieldsViaBackendVLM(imageBlob, pageWidth, pageHeight)
  } catch (err) {
    console.warn('Backend field detection unavailable, falling back to on-device', err)
    return await detectFieldsViaOpenCV(imageDataUrl, pageWidth, pageHeight)
  }
}

/** Spec-conform entry point. Returns just the FieldDetectionResult. */
export async function detectFields(
  input: File | Blob,
  inputType: 'image' | 'pdf'
): Promise<FieldDetectionResult> {
  const { detection } = await detectFieldsWithImage(input, inputType)
  return detection
}

/**
 * Full variant — also returns the rasterized page so callers can show the
 * review overlay and render fills without re-rasterizing.
 * MVP scope: first page only (matches the single-image fill flow).
 */
export async function detectFieldsWithImage(
  input: File | Blob,
  inputType: 'image' | 'pdf'
): Promise<DetectionWithImage> {
  if (inputType === 'pdf') {
    const [pageCount, pages] = await Promise.all([
      getPdfPageCount(input).catch(() => 1),
      rasterizePdfPages(input, undefined, { maxPages: 1 }),
    ])
    const page = pages[0]

    // Tier 0 — real AcroForm fields: no OCR/CV needed at all.
    // pdf-lib loads lazily so image-only users never download it.
    const { tryAcroFormExtraction } = await import('./fieldDetect/acroform')
    const acro = await tryAcroFormExtraction(input, page).catch(() => null)
    if (acro && acro.fields.length > 0) {
      if (pageCount > 1) {
        acro.warnings = [
          ...(acro.warnings ?? []),
          `PDF has ${pageCount} pages — only page 1 was analyzed`,
        ]
      }
      return { detection: acro, imageDataUrl: page.dataUrl }
    }

    let detection = await runPipeline(input, page.dataUrl, page.width, page.height)
    if (pageCount > 1) {
      detection = {
        ...detection,
        warnings: [
          ...(detection.warnings ?? []),
          `PDF has ${pageCount} pages — only page 1 was analyzed`,
        ],
      }
    }
    return { detection, imageDataUrl: page.dataUrl }
  }

  // Image input — unified path
  const dataUrl = await blobToDataUrl(input)
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not decode the captured image'))
    img.src = dataUrl
  })
  const detection = await runPipeline(input, dataUrl, dims.w, dims.h)
  return { detection, imageDataUrl: dataUrl }
}
