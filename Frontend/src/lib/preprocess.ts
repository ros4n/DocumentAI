/* ============================================================
   Scan pre-processing — runs between capture and OCR / field
   detection. A phone photo of a paper form is the worst OCR
   input there is; cleaning it up multiplies the accuracy of
   every downstream stage.

   Pipeline (OpenCV.js, on-device):
     1. Detect the document quadrilateral, perspective-warp it flat
     2. Deskew any residual rotation (when no quad was found)
     3. Flatten uneven lighting / shadow (morphological background
        division), stretch contrast (CLAHE), gentle unsharp
     4. Resize toward ~300 DPI (upscale small captures)
     5. Blur score (variance of Laplacian) so the UI can suggest a
        retake

   Falls back to a canvas-only clean-up if OpenCV can't load, and
   returns the original untouched if even that fails — this step
   must never block a scan.
   ============================================================ */

import { loadCv, imageToMat, type Cv, type CvStage } from './opencv'

export interface PreprocessMeta {
  engine: 'opencv' | 'canvas' | 'none'
  documentDetected: boolean
  rotatedDeg: number
  blurScore: number | null
  blurry: boolean
  sourceLongEdge: number
  outputLongEdge: number
  ms: number
}

export interface PreprocessResult {
  dataUrl: string
  meta: PreprocessMeta
}

export interface PreprocessOptions {
  onStage?: CvStage
  /** Long edge to target for the cleaned output. */
  targetLongEdge?: number
  /** Below this Laplacian variance the scan is flagged blurry. */
  blurThreshold?: number
}

const DEFAULT_TARGET = 2200
const DEFAULT_MAX = 3200
const DEFAULT_BLUR_THRESHOLD = 90

/* ── Mat lifetime helper ─────────────────────────────────────────────── */

class Bag {
  private mats: { delete: () => void }[] = []
  keep<T extends { delete: () => void }>(m: T): T {
    this.mats.push(m)
    return m
  }
  free() {
    for (const m of this.mats) {
      try {
        m.delete()
      } catch {
        /* already freed */
      }
    }
    this.mats = []
  }
}

/* ── Geometry ────────────────────────────────────────────────────────── */

type Pt = { x: number; y: number }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Order 4 corners as [top-left, top-right, bottom-right, bottom-left]. */
function orderCorners(pts: Pt[]): Pt[] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y))
  const tl = bySum[0]
  const br = bySum[3]
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x))
  const tr = byDiff[0]
  const bl = byDiff[3]
  return [tl, tr, br, bl]
}

/**
 * Largest convex 4-gon that plausibly bounds the document, in the
 * coordinate space of a downscaled working copy. Returns null when the
 * frame already IS the document (no visible margin) or nothing fits.
 */
function detectDocumentQuad(cv: Cv, rgba: any, w: number, h: number): Pt[] | null {
  const bag = new Bag()
  try {
    const scale = 900 / Math.max(w, h)
    const sw = Math.max(1, Math.round(w * scale))
    const sh = Math.max(1, Math.round(h * scale))
    const small = bag.keep(new cv.Mat())
    cv.resize(rgba, small, new cv.Size(sw, sh), 0, 0, cv.INTER_AREA)

    const gray = bag.keep(new cv.Mat())
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)
    const edges = bag.keep(new cv.Mat())
    cv.Canny(gray, edges, 60, 180)
    const k = bag.keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)))
    cv.dilate(edges, edges, k, new cv.Point(-1, -1), 2)

    const contours = bag.keep(new cv.MatVector())
    const hierarchy = bag.keep(new cv.Mat())
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const frameArea = sw * sh
    const candidates: { pts: Pt[]; area: number }[] = []
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const a = cv.contourArea(c)
      if (a < frameArea * 0.2 || a > frameArea * 0.985) {
        c.delete()
        continue
      }
      const peri = cv.arcLength(c, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(c, approx, 0.02 * peri, true)
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts: Pt[] = []
        for (let j = 0; j < 4; j++) {
          pts.push({ x: approx.data32S[j * 2] / scale, y: approx.data32S[j * 2 + 1] / scale })
        }
        candidates.push({ pts, area: a })
      }
      approx.delete()
      c.delete()
    }
    if (candidates.length === 0) return null
    candidates.sort((x, y) => y.area - x.area)
    const quad = orderCorners(candidates[0].pts)

    // Reject near-full-frame (just traced the photo border) and silly aspects.
    const outW = Math.max(dist(quad[2], quad[3]), dist(quad[1], quad[0]))
    const outH = Math.max(dist(quad[1], quad[2]), dist(quad[0], quad[3]))
    const coverage = (candidates[0].area / (scale * scale)) / (w * h)
    const aspect = outW / Math.max(1, outH)
    if (coverage > 0.97) return null
    if (aspect < 0.28 || aspect > 3.6) return null
    return quad
  } catch (err) {
    console.warn('document quad detection failed', err)
    return null
  } finally {
    bag.free()
  }
}

function warpToQuad(cv: Cv, rgba: any, quad: Pt[]): any {
  const outW = Math.round(Math.max(dist(quad[2], quad[3]), dist(quad[1], quad[0])))
  const outH = Math.round(Math.max(dist(quad[1], quad[2]), dist(quad[0], quad[3])))
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad[0].x, quad[0].y,
    quad[1].x, quad[1].y,
    quad[2].x, quad[2].y,
    quad[3].x, quad[3].y,
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  const dst = new cv.Mat()
  cv.warpPerspective(
    rgba,
    dst,
    M,
    new cv.Size(outW, outH),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(255, 255, 255, 255)
  )
  srcTri.delete()
  dstTri.delete()
  M.delete()
  return dst
}

/** Residual skew in degrees from the dominant text orientation. */
function estimateSkew(cv: Cv, gray: any): number {
  const bag = new Bag()
  try {
    const scale = 800 / Math.max(gray.cols, gray.rows)
    const small = bag.keep(new cv.Mat())
    cv.resize(gray, small, new cv.Size(0, 0), scale, scale, cv.INTER_AREA)
    const bin = bag.keep(new cv.Mat())
    cv.threshold(small, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
    const pts = bag.keep(new cv.Mat())
    cv.findNonZero(bin, pts)
    if (pts.rows < 50) return 0
    const rect = cv.minAreaRect(pts)
    let angle = rect.angle
    if (angle < -45) angle += 90
    if (angle > 45) angle -= 90
    return Math.abs(angle) < 10 ? angle : 0
  } catch {
    return 0
  } finally {
    bag.free()
  }
}

function rotate(cv: Cv, rgba: any, deg: number): any {
  const center = new cv.Point(rgba.cols / 2, rgba.rows / 2)
  const M = cv.getRotationMatrix2D(center, deg, 1)
  const dst = new cv.Mat()
  cv.warpAffine(
    rgba,
    dst,
    M,
    new cv.Size(rgba.cols, rgba.rows),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(255, 255, 255, 255)
  )
  M.delete()
  return dst
}

/* ── Main ────────────────────────────────────────────────────────────── */

async function withOpenCv(dataUrl: string, opts: PreprocessOptions): Promise<PreprocessResult> {
  const started = performance.now()
  const target = opts.targetLongEdge ?? DEFAULT_TARGET
  const blurThreshold = opts.blurThreshold ?? DEFAULT_BLUR_THRESHOLD
  const cv = await loadCv(opts.onStage)
  opts.onStage?.('Cleaning up the scan…')

  const bag = new Bag()
  try {
    const { mat: rgba0, width: w0, height: h0 } = await imageToMat(cv, dataUrl, 4000)
    bag.keep(rgba0)
    const sourceLongEdge = Math.max(w0, h0)

    // 1. Perspective correction
    const quad = detectDocumentQuad(cv, rgba0, w0, h0)
    let working: any
    let documentDetected = false
    if (quad) {
      working = bag.keep(warpToQuad(cv, rgba0, quad))
      documentDetected = true
    } else {
      working = bag.keep(rgba0.clone())
    }

    // downscale huge inputs so the heavy morphology stays fast
    if (Math.max(working.cols, working.rows) > DEFAULT_MAX) {
      const s = DEFAULT_MAX / Math.max(working.cols, working.rows)
      const shrunk = bag.keep(new cv.Mat())
      cv.resize(working, shrunk, new cv.Size(0, 0), s, s, cv.INTER_AREA)
      working = shrunk
    }

    // 2. Deskew (only meaningful when we didn't already square it with a warp)
    let rotatedDeg = 0
    {
      const g = bag.keep(new cv.Mat())
      cv.cvtColor(working, g, cv.COLOR_RGBA2GRAY)
      if (!documentDetected) {
        const skew = estimateSkew(cv, g)
        if (Math.abs(skew) > 0.3) {
          working = bag.keep(rotate(cv, working, skew))
          rotatedDeg = skew
        }
      }
    }

    // 3. Grayscale, flatten lighting, contrast, sharpen
    const gray = bag.keep(new cv.Mat())
    cv.cvtColor(working, gray, cv.COLOR_RGBA2GRAY)

    const kSize =
      Math.max(15, Math.round(Math.max(gray.cols, gray.rows) / 60)) | 1 // odd
    const bgKernel = bag.keep(
      cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kSize, kSize))
    )
    const bg = bag.keep(new cv.Mat())
    cv.morphologyEx(gray, bg, cv.MORPH_CLOSE, bgKernel)
    const flat = bag.keep(new cv.Mat())
    cv.divide(gray, bg, flat, 255)

    const clahe = bag.keep(new cv.CLAHE(2.0, new cv.Size(8, 8)))
    const eq = bag.keep(new cv.Mat())
    clahe.apply(flat, eq)

    // 4. Blur score on the pre-sharpen equalised image
    let blurScore: number | null = null
    {
      const lap = bag.keep(new cv.Mat())
      cv.Laplacian(eq, lap, cv.CV_64F)
      const mean = bag.keep(new cv.Mat())
      const std = bag.keep(new cv.Mat())
      cv.meanStdDev(lap, mean, std)
      const s = std.data64F[0]
      blurScore = s * s
    }

    // gentle unsharp mask
    const blur = bag.keep(new cv.Mat())
    cv.GaussianBlur(eq, blur, new cv.Size(0, 0), 1.2)
    const sharp = bag.keep(new cv.Mat())
    cv.addWeighted(eq, 1.5, blur, -0.5, 0, sharp)

    // 5. Resize toward target DPI
    let final = sharp
    const longEdge = Math.max(final.cols, final.rows)
    if (longEdge < target * 0.85) {
      const s = target / longEdge
      const up = bag.keep(new cv.Mat())
      cv.resize(final, up, new cv.Size(0, 0), s, s, cv.INTER_CUBIC)
      final = up
    }

    const outRgba = bag.keep(new cv.Mat())
    cv.cvtColor(final, outRgba, cv.COLOR_GRAY2RGBA)
    const canvas = document.createElement('canvas')
    cv.imshow(canvas, outRgba)
    const out = canvas.toDataURL('image/jpeg', 0.92)

    return {
      dataUrl: out,
      meta: {
        engine: 'opencv',
        documentDetected,
        rotatedDeg: Math.round(rotatedDeg * 10) / 10,
        blurScore: blurScore == null ? null : Math.round(blurScore),
        blurry: blurScore != null && blurScore < blurThreshold,
        sourceLongEdge,
        outputLongEdge: Math.max(final.cols, final.rows),
        ms: Math.round(performance.now() - started),
      },
    }
  } finally {
    bag.free()
  }
}

/** Canvas-only clean-up: grayscale + min/max contrast stretch + upscale. */
async function withCanvas(dataUrl: string, opts: PreprocessOptions): Promise<PreprocessResult> {
  const started = performance.now()
  const target = opts.targetLongEdge ?? DEFAULT_TARGET
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not decode the capture'))
    img.src = dataUrl
  })
  const srcLong = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = srcLong < target * 0.85 ? target / srcLong : 1
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  let lo = 255
  let hi = 0
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0
    px[i] = px[i + 1] = px[i + 2] = g
    if (g < lo) lo = g
    if (g > hi) hi = g
  }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) / range) * 255))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    meta: {
      engine: 'canvas',
      documentDetected: false,
      rotatedDeg: 0,
      blurScore: null,
      blurry: false,
      sourceLongEdge: srcLong,
      outputLongEdge: Math.max(w, h),
      ms: Math.round(performance.now() - started),
    },
  }
}

/**
 * Clean up a captured image for OCR / field detection. Never throws:
 * on any failure it returns the original data URL with engine 'none'.
 */
export async function preprocessScan(
  dataUrl: string,
  opts: PreprocessOptions = {}
): Promise<PreprocessResult> {
  try {
    return await withOpenCv(dataUrl, opts)
  } catch (err) {
    console.warn('OpenCV pre-processing failed, trying canvas fallback', err)
  }
  try {
    return await withCanvas(dataUrl, opts)
  } catch (err) {
    console.warn('Canvas pre-processing failed, using original', err)
  }
  return {
    dataUrl,
    meta: {
      engine: 'none',
      documentDetected: false,
      rotatedDeg: 0,
      blurScore: null,
      blurry: false,
      sourceLongEdge: 0,
      outputLongEdge: 0,
      ms: 0,
    },
  }
}
