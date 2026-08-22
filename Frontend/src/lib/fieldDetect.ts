/* ============================================================
   Field-detection pipeline orchestrator (Section 6).

   Unified entry point for image AND pdf input:

     PDF â”€â”€â–º rasterize page â”€â”€â–º TIER 0 AcroForm (pdf-lib)
                                  â”‚ zero fields?
                                  â–¼
     image â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º TIER 1 backend VLM (15s timeout)
                                  â”‚ unreachable / invalid?
                                  â–¼
                              TIER 2 on-device OpenCV.js

   Every tier emits the same DetectedField[] contract from
   lib/types.ts â€” downstream never knows which tier ran.
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
  /** Rasterized page / source image â€” same coordinate space as `detection` */
  imageDataUrl: string
}

/** Optional live status callback so UI can show what Tier 2 is doing
 *  (downloading engine %, OCR pass, shape analysis) instead of a silent hang */
export type DetectionStageCallback = (message: string) => void

/**
 * Core pipeline over a known rasterized page. `imageBlob` is uploaded to the
 * Tier 1 backend; `imageDataUrl` drives the Tier 2 OpenCV pass locally.
 */
async function runPipeline(
  imageBlob: Blob,
  imageDataUrl: string,
  pageWidth: number,
  pageHeight: number,
  onStage?: DetectionStageCallback
): Promise<FieldDetectionResult> {
  onStage?.('Contacting detection serviceâ€¦')
  try {
    return await detectFieldsViaBackendVLM(imageBlob, pageWidth, pageHeight)
  } catch (err) {
    console.warn('Backend field detection unavailable, falling back to on-device', err)
    return await detectFieldsViaOpenCV(imageDataUrl, pageWidth, pageHeight, onStage)
  }
}

/** Spec-conform entry point. Returns just the FieldDetectionResult. */
export async function detectFields(
  input: File | Blob,
  inputType: 'image' | 'pdf',
  onStage?: DetectionStageCallback
): Promise<FieldDetectionResult> {
  const { detection } = await detectFieldsWithImage(input, inputType, onStage)
  return detection
}

/**
 * Full variant â€” also returns the rasterized page so callers can show the
 * review overlay and render fills without re-rasterizing.
 * MVP scope: first page only (matches the single-image fill flow).
 */
export async function detectFieldsWithImage(
  input: File | Blob,
  inputType: 'image' | 'pdf',
  onStage?: DetectionStageCallback
): Promise<DetectionWithImage> {
  if (inputType === 'pdf') {
    const [pageCount, pages] = await Promise.all([
      getPdfPageCount(input).catch(() => 1),
      rasterizePdfPages(input, undefined, { maxPages: 1 }),
    ])
    const page = pages[0]

    // Tier 0 â€” real AcroForm fields: no OCR/CV needed at all.
    // pdf-lib loads lazily so image-only users never download it.
    const { tryAcroFormExtraction } = await import('./fieldDetect/acroform')
    const acro = await tryAcroFormExtraction(input, page).catch(() => null)
    if (acro && acro.fields.length > 0) {
      if (pageCount > 1) {
        acro.warnings = [
          ...(acro.warnings ?? []),
          `PDF has ${pageCount} pages â€” only page 1 was analyzed`,
        ]
      }
      return { detection: acro, imageDataUrl: page.dataUrl }
    }

    let detection = await runPipeline(input, page.dataUrl, page.width, page.height, onStage)
    if (pageCount > 1) {
      detection = {
        ...detection,
        warnings: [
          ...(detection.warnings ?? []),
          `PDF has ${pageCount} pages â€” only page 1 was analyzed`,
        ],
      }
    }
    return { detection, imageDataUrl: page.dataUrl }
  }

  // Image input â€” unified path
  const dataUrl = await blobToDataUrl(input)
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not decode the captured image'))
    img.src = dataUrl
  })
  const detection = await runPipeline(input, dataUrl, dims.w, dims.h, onStage)
  return { detection, imageDataUrl: dataUrl }
}
