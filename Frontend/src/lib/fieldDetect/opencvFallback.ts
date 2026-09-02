/* ============================================================
   Tier 2 — On-device OpenCV.js field detection (WASM, no backend)

   Pass A: Hough line transform → blank text-line candidates
   Pass B: contours + Hough circles → checkbox / radio candidates
   Pass C: reading-order-aware label pairing against the existing
           Tesseract.js OCR word layout + radio grouping

   Runs entirely in the browser; opencv.js is lazy-loaded only
   when this tier is actually needed (same spirit as Tesseract).
   All math in PIXEL space of the rasterized page image.
   ============================================================ */

import { getOcrWorker } from '../ocr'
import { loadCv, imageToMat, type Cv } from '../opencv'
import type { BoundingBox, DetectedField, FieldDetectionResult } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  confidence: number
}

async function tesseractWords(dataUrl: string): Promise<OcrWord[]> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(dataUrl, undefined, { blocks: true })
  const words: OcrWord[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          const t = word.text.trim()
          if (!t || word.confidence < 40) continue
          words.push({
            text: t,
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
            confidence: word.confidence,
          })
        }
      }
    }
  }
  return words
}

/* ── Geometry helpers ──────────────────────────────────────────────── */

const clampBox = (b: BoundingBox, w: number, h: number): BoundingBox => ({
  x: Math.max(0, Math.round(b.x)),
  y: Math.max(0, Math.round(b.y)),
  width: Math.min(w, Math.round(b.width)),
  height: Math.min(h, Math.round(b.height)),
})

function area(b: BoundingBox): number {
  return b.width * b.height
}

function intersection(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

function containsRatio(inner: BoundingBox, outer: BoundingBox): number {
  if (area(outer) === 0) return 0
  return area(intersection(inner, outer)) / area(inner)
}

/* ── Pass A: horizontal rule → text-line candidates ────────────────── */

interface LineSeg {
  x1: number
  y1: number
  x2: number
  y2: number
}

function houghLineSegments(cv: Cv, bin: any, pageW: number): LineSeg[] {
  const lines = new cv.Mat()
  try {
    cv.HoughLinesP(
      bin,
      lines,
      1,
      Math.PI / 180,
      80,
      Math.max(40, pageW * 0.03), // spec: ≥3% page width to skip noise
      6
    )
    const segs: LineSeg[] = []
    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]
      const angle = Math.abs((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI)
      if (angle > 5 && angle < 175) continue // near-horizontal only (±5°)
      segs.push({ x1: Math.min(x1, x2), y1, x2: Math.max(x1, x2), y2 })
    }
    return segs
  } finally {
    lines.delete()
  }
}

/** Merge collinear segments on the same row (dashed/segmented blanks). */
export function mergeRowSegments(segs: LineSeg[], rowTol = 5, gap = 70): LineSeg[] {
  const sorted = [...segs].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1)
  const rows: LineSeg[][] = []
  for (const s of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y1 - s.y1) <= rowTol)
    if (row) row.push(s)
    else rows.push([s])
  }
  const merged: LineSeg[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x1 - b.x1)
    let current = { ...row[0] }
    for (let i = 1; i < row.length; i++) {
      const next = row[i]
      if (next.x1 - current.x2 <= gap) {
        current = { ...current, x2: Math.max(current.x2, next.x2) }
      } else {
        merged.push(current)
        current = { ...next }
      }
    }
    merged.push(current)
  }
  return merged.filter((s) => s.x2 > s.x1)
}

/* ── Candidate containers ──────────────────────────────────────────── */

interface MarkCandidate {
  bbox: BoundingBox
  kind: 'checkbox' | 'radio'
  shapeScore: number
}

/* ── Pass B: checkbox contours + radio circles ─────────────────────── */

function detectCheckboxes(cv: Cv, bin: any, minSide: number, maxSide: number): MarkCandidate[] {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const approx = new cv.Mat()
  const out: MarkCandidate[] = []
  try {
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      try {
        const peri = cv.arcLength(cnt, true)
        cv.approxPolyDP(cnt, approx, 0.04 * peri, true)
        const rect = cv.boundingRect(cnt)
        const side = (rect.width + rect.height) / 2
        if (side < minSide || side > maxSide) continue
        const aspect = rect.width / Math.max(1, rect.height)
        if (aspect < 0.7 || aspect > 1.35) continue
        const vertices = approx.rows
        if (vertices !== 4 && vertices !== 5) continue // square-ish outline
        const fillRatio = cv.contourArea(cnt) / Math.max(1, rect.width * rect.height)
        if (fillRatio < 0.55) continue // hollow box outline ≈ perimeter/(w*h) small but area ratio ~0.7-1 for thin border bounding? keep loose
        out.push({
          bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          kind: 'checkbox',
          shapeScore: 1 - Math.min(1, Math.abs(aspect - 1)) * 0.5,
        })
      } finally {
        cnt.delete()
      }
    }
  } finally {
    contours.delete()
    hierarchy.delete()
    approx.delete()
  }
  return out
}

function detectRadios(cv: Cv, gray: any, medianH: number): MarkCandidate[] {
  const circles = new cv.Mat()
  const blurred = new cv.Mat()
  const out: MarkCandidate[] = []
  try {
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 1.2)
    const minR = Math.max(5, Math.round(medianH * 0.25))
    const maxR = Math.max(minR + 3, Math.round(Math.min(30, medianH * 0.9)))
    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      Math.max(12, medianH),
      100,
      17,
      minR,
      maxR
    )
    for (let i = 0; i < circles.cols; i++) {
      const cx = circles.data32F[i * 3]
      const cy = circles.data32F[i * 3 + 1]
      const r = circles.data32F[i * 3 + 2]
      out.push({
        bbox: { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
        kind: 'radio',
        shapeScore: 0.8,
      })
    }
  } finally {
    circles.delete()
    blurred.delete()
  }
  return out
}

/* ── Label pairing (Pass C) ────────────────────────────────────────── */

function verticalOverlapRatio(aY0: number, aY1: number, bY0: number, bY1: number): number {
  const ov = Math.min(aY1, bY1) - Math.max(aY0, bY0)
  const denom = Math.max(1, Math.min(aY1 - aY0, bY1 - bY0))
  return Math.max(0, ov) / denom
}

function horizontalOverlapRatio(ax0: number, ax1: number, bx0: number, bx1: number): number {
  const ov = Math.min(ax1, bx1) - Math.max(ax0, bx0)
  const denom = Math.max(1, Math.min(ax1 - ax0, bx1 - bx0))
  return Math.max(0, ov) / denom
}

/** Extend an anchor word into a full label using its row neighbours. */
function buildLabel(anchor: OcrWord, all: OcrWord[], towardX: number): { label: string; conf: number } {
  const rowWords = all.filter(
    (w) =>
      w !== anchor &&
      verticalOverlapRatio(w.y0, w.y1, anchor.y0, anchor.y1) > 0.55 &&
      Math.abs(w.y1 - anchor.y1) < anchor.y1 - anchor.y0
  )
  const members = [anchor, ...rowWords]
    .filter((w) => {
      // keep words between the anchor and the field on the relevant side
      const midAnchor = (anchor.x0 + anchor.x1) / 2
      const mid = (w.x0 + w.x1) / 2
      return towardX >= midAnchor ? mid >= Math.min(midAnchor, towardX) - 8 : mid <= Math.max(midAnchor, towardX) + 8
    })
    .sort((a, b) => a.x0 - b.x0)
  const label = members
    .map((w) => w.text)
    .join(' ')
    .replace(/[:：]\s*$/, '')
    .slice(0, 60)
    .trim()
  const conf = members.reduce((s, w) => s + w.confidence, 0) / Math.max(1, members.length)
  return { label, conf }
}

interface PairResult {
  label: string
  ocrConfidence: number
  proximity: number // 0..1, closer = higher
  priorityHit: boolean // matched the preferred side
}

function pairMarkLabel(mark: BoundingBox, words: OcrWord[]): PairResult | null {
  const mh = mark.height
  const cx = mark.x + mark.width / 2
  const cy = mark.y + mark.height / 2

  const rightWords = words
    .filter((w) => w.x0 >= mark.x + mark.width - 3)
    .filter((w) => verticalOverlapRatio(w.y0, w.y1, cy - mh * 0.9, cy + mh * 0.9) > 0.4)
    .sort((a, b) => a.x0 - b.x0)
  if (rightWords.length > 0 && rightWords[0].x0 - (mark.x + mark.width) < mh * 2.2) {
    const anchor = rightWords[0]
    const p = buildLabel(anchor, words, mark.x)
    return { label: p.label, ocrConfidence: p.conf, proximity: 0.95, priorityHit: true }
  }

  const aboveWords = words
    .filter((w) => w.y1 <= mark.y + mh * 0.4)
    .filter((w) => horizontalOverlapRatio(w.x0, w.x1, cx - mh, cx + mh) > 0.25)
    .sort((a, b) => mark.y - a.y1 - (mark.y - b.y1))
  if (aboveWords.length > 0 && mark.y - aboveWords[0].y1 < mh * 3.2) {
    const anchor = aboveWords[0]
    const p = buildLabel(anchor, words, cx)
    return { label: p.label, ocrConfidence: p.conf, proximity: 0.75, priorityHit: false }
  }

  const leftWords = words
    .filter((w) => w.x1 <= mark.x + 3)
    .filter((w) => verticalOverlapRatio(w.y0, w.y1, cy - mh * 0.9, cy + mh * 0.9) > 0.4)
    .sort((a, b) => b.x1 - a.x1)
  if (leftWords.length > 0 && mark.x - leftWords[0].x1 < mh * 2.2) {
    const anchor = leftWords[0]
    const p = buildLabel(anchor, words, mark.x + mark.width)
    return { label: p.label, ocrConfidence: p.conf, proximity: 0.7, priorityHit: false }
  }

  return null
}

function pairTextLineLabel(box: BoundingBox, words: OcrWord[]): PairResult | null {
  const bh = box.height
  const cx = box.x + box.width / 2

  const aboveWords = words
    .filter((w) => w.y1 <= box.y + bh * 0.5)
    .filter((w) => horizontalOverlapRatio(w.x0, w.x1, box.x, box.x + box.width) > 0.2)
    .sort((a, b) => box.y - a.y1 - (box.y - b.y1))
  if (aboveWords.length > 0 && box.y - aboveWords[0].y1 < bh * 3.5) {
    const anchor = aboveWords[0]
    const p = buildLabel(anchor, words, cx)
    return { label: p.label, ocrConfidence: p.conf, proximity: 0.9, priorityHit: true }
  }

  const leftWords = words
    .filter((w) => w.x1 <= box.x + 4)
    .filter(
      (w) =>
        verticalOverlapRatio(w.y0, w.y1, box.y - bh * 0.4, box.y + box.height + bh * 0.4) > 0.45
    )
    .sort((a, b) => b.x1 - a.x1)
  if (leftWords.length > 0 && box.x - leftWords[0].x1 < bh * 14) {
    const anchor = leftWords[0]
    const p = buildLabel(anchor, words, box.x + box.width)
    return { label: p.label, ocrConfidence: p.conf, proximity: 0.75, priorityHit: false }
  }

  return null
}

/* ── Row snapping: tighten text candidates against the OCR layout ──── */

/**
 * Pass-A candidates are "underline − estimated height" boxes. Refine each
 * one against the actual words on its row: adopt the row's true top/bottom
 * and pull the horizontal edges inside the gap between neighbouring words.
 * Only ever shrinks/corrects within the original candidate's footprint.
 */
function snapTextToRow(
  bbox: BoundingBox,
  words: OcrWord[]
): { bbox: BoundingBox; snapped: boolean } {
  const cy = bbox.y + bbox.height / 2

  const rowWords = words.filter((w) => {
    const wcy = (w.y0 + w.y1) / 2
    return Math.abs(wcy - cy) < bbox.height * 0.9
  })
  if (rowWords.length === 0) return { bbox, snapped: false }

  const rowTop = Math.min(...rowWords.map((w) => w.y0))
  const rowBottom = Math.max(...rowWords.map((w) => w.y1))

  let x1 = bbox.x
  let x2 = bbox.x + bbox.width

  const maxSpan = bbox.width
  const leftNeighbors = rowWords.filter((w) => w.x1 <= bbox.x + 4)
  if (leftNeighbors.length > 0) {
    const labelEnd = Math.max(...leftNeighbors.map((w) => w.x1))
    x1 = Math.min(bbox.x + maxSpan * 0.6, Math.max(bbox.x, labelEnd + 2))
  }
  const rightNeighbors = rowWords.filter(
    (w) => w.x0 >= bbox.x + bbox.width - 4 && w.x0 < bbox.x + maxSpan * 2.5
  )
  if (rightNeighbors.length > 0) {
    const nextStart = Math.min(...rightNeighbors.map((w) => w.x0))
    x2 = Math.max(bbox.x + maxSpan * 0.4, Math.min(bbox.x + bbox.width, nextStart - 2))
  }
  if (x2 - x1 < 14) {
    x1 = bbox.x
    x2 = bbox.x + bbox.width
  }

  return {
    bbox: {
      x: x1,
      y: rowTop - 2,
      width: Math.max(14, x2 - x1),
      height: Math.max(10, rowBottom - rowTop + 4),
    },
    snapped: true,
  }
}

/* ── Radio grouping ────────────────────────────────────────────────── */

function groupRadios(radios: DetectedField[]): void {
  type Cluster = { fields: DetectedField[] }
  const clusters: Cluster[] = []
  for (const f of radios) {
    const best = clusters.find((c) =>
      c.fields.some((g) => {
        const sizeDiff =
          Math.abs(g.bbox.width - f.bbox.width) / Math.max(g.bbox.width, f.bbox.width)
        if (sizeDiff > 0.45) return false
        const gcx = g.bbox.x + g.bbox.width / 2
        const fcx = f.bbox.x + f.bbox.width / 2
        const gcy = g.bbox.y + g.bbox.height / 2
        const fcy = f.bbox.y + f.bbox.height / 2
        const alignedV = Math.abs(gcx - fcx) < f.bbox.width * 1.2
        const alignedH = Math.abs(gcy - fcy) < f.bbox.height * 0.8
        const dist = Math.hypot(gcx - fcx, gcy - fcy)
        return dist < 160 && (alignedV || alignedH)
      })
    )
    if (best) best.fields.push(f)
    else clusters.push({ fields: [f] })
  }
  clusters.forEach((c, i) => {
    if (c.fields.length < 2) return
    const gid = `group_cv_${i}`
    for (const f of c.fields) f.groupId = gid
  })
}

/* ── Main entry ────────────────────────────────────────────────────── */

/** Cap on the CV working resolution. Hough transforms and contour scans
 *  are O(area) in WASM — running them on full-res camera photos (12 MP)
 *  takes minutes; everything runs fine at ≤1400 px and coordinates are
 *  mapped back to source pixels afterwards. */
const WORK_MAX_SIDE = 1400

export async function detectFieldsViaOpenCV(
  dataUrl: string,
  pageWidth: number,
  pageHeight: number,
  onStage?: (message: string) => void
): Promise<FieldDetectionResult> {
  const warnings: string[] = []
  if (pageWidth > 0 && pageHeight > 0) {
    warnings.push('Backend detection unavailable — using on-device shape analysis')
  }
  const cv = await loadCv(onStage)

  // Downscaled workspace — all OpenCV passes run here
  const { mat: src, width: W, height: H } = await imageToMat(cv, dataUrl, WORK_MAX_SIDE)
  const scale = pageWidth > 0 ? W / pageWidth : 1
  const gray = new cv.Mat()
  const binLines = new cv.Mat()
  const binShapes = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    // Ink-white threshold for line extraction and contour work
    cv.adaptiveThreshold(gray, binLines, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 21, 12)
    cv.adaptiveThreshold(gray, binShapes, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 6)

    /* ---- OCR layout first: everything pairs against it ---- */
    // Tesseract runs on the FULL-RESOLUTION image for best accuracy;
    // its word boxes are then scaled into the workspace.
    onStage?.('Reading page text (on-device OCR)…')
    const rawWords = await tesseractWords(dataUrl)
    // Defensive bounds check — guards against decoder/EXIF divergence where
    // Tesseract's reported boxes wouldn't match our workspace scaling
    const words = rawWords
      .map((w) => ({
        ...w,
        x0: w.x0 * scale,
        y0: w.y0 * scale,
        x1: w.x1 * scale,
        y1: w.y1 * scale,
      }))
      .filter(
        (w) =>
          w.x0 >= -2 && w.y0 >= -2 && w.x1 <= W + 4 && w.y1 <= H + 4
      )
    const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b)
    const medianH = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 22
    const estTextH = Math.min(48, Math.max(12, medianH))

    /* ---- Pass A + B ---- */
    onStage?.('Analyzing page shapes…')
    const segs = mergeRowSegments(houghLineSegments(cv, binLines, W)).filter(
      (s) => s.x2 - s.x1 < W * 0.85 && s.y1 < H - 8 && s.y1 > 8
    )
    const textCandidates: Array<{ bbox: BoundingBox }> = segs.map((s) => ({
      bbox: clampBox({ x: s.x1, y: s.y1 - estTextH, width: s.x2 - s.x1, height: estTextH }, W, H),
    }))

    /* ---- Pass B: marks ---- */
    const minSide = Math.max(9, Math.round(estTextH * 0.5))
    const maxSide = Math.max(24, Math.round(estTextH * 1.9))
    let marks: MarkCandidate[] = [
      ...detectCheckboxes(cv, binShapes, minSide, maxSide),
      ...detectRadios(cv, gray, estTextH),
    ]

    // Drop candidates nested inside another accepted candidate (>70% contained)
    marks.sort((a, b) => area(b.bbox) - area(a.bbox))
    const keptMarks: MarkCandidate[] = []
    for (const m of marks) {
      const nested = keptMarks.some((k) => containsRatio(m.bbox, k.bbox) > 0.7)
      if (!nested) keptMarks.push(m)
    }
    marks = keptMarks

    // Drop "checkboxes" that are actually glyphs: heavy overlap with a
    // multi-character OCR word bbox means it's probably an 'o' or '0'.
    marks = marks.filter((m) => {
      const overlappingWord = words.find(
        (w) => w.text.replace(/\W/g, '').length > 1 && containsRatio(m.bbox, { x: w.x0, y: w.y0, width: w.x1 - w.x0, height: w.y1 - w.y0 }) > 0.55
      )
      return !overlappingWord
    })

    // A mark sitting inside a text-line candidate means that candidate is
    // actually the answer row of that mark — drop the text candidate.
    const filteredText = textCandidates.filter(
      (t) => !marks.some((m) => containsRatio(m.bbox, t.bbox) > 0.15)
    )

    /* ---- Assemble DetectedFields with Pass C pairing ---- */
    // Workspace boxes are mapped back to SOURCE pixel space (÷ scale) so
    // every tier emits coordinates in the same space as the page image.
    const toSourceBox = (b: BoundingBox): BoundingBox =>
      clampBox(
        {
          x: b.x / scale,
          y: b.y / scale,
          width: b.width / scale,
          height: b.height / scale,
        },
        pageWidth || W,
        pageHeight || H
      )

    const fields: DetectedField[] = []
    let index = 0
    const lowConfidence: string[] = []

    for (const t of filteredText) {
      const { bbox: snappedBbox, snapped } = snapTextToRow(t.bbox, words)
      const pair = pairTextLineLabel(snappedBbox, words)
      let confidence = 0.45 + (pair ? 0.25 : 0) + (pair?.priorityHit ? 0.1 : 0)
      if (!pair || !pair.label) confidence *= 0.5
      fields.push({
        id: `field_${index++}`,
        label: pair?.label ?? '',
        fieldType: /\b(date|dob|birth|expir)\b/i.test(pair?.label ?? '') ? 'date' : 'text_line',
        bbox: toSourceBox(snappedBbox),
        confidence: Math.min(0.9, confidence + (snapped ? 0.05 : 0)),
        source: 'cv',
      })
    }

    for (const m of marks) {
      const pair = pairMarkLabel(m.bbox, words)
      let confidence =
        m.shapeScore * 0.4 +
        (pair ? 0.3 : 0) +
        (pair?.priorityHit ? 0.15 : 0) +
        Math.min(0.15, ((pair?.ocrConfidence ?? 0) / 100) * 0.15)
      if (!pair || !pair.label) confidence *= 0.5
      const field: DetectedField = {
        id: `field_${index++}`,
        label: pair?.label ?? '',
        fieldType: m.kind,
        bbox: toSourceBox(m.bbox),
        confidence: Math.min(0.9, confidence),
        source: 'cv',
      }
      fields.push(field)
    }

    groupRadios(fields.filter((f) => f.fieldType === 'radio'))

    for (const f of fields) {
      if (!f.label) {
        lowConfidence.push(f.id)
      }
    }
    if (lowConfidence.length > 0) {
      warnings.push(
        `${lowConfidence.length} field(s) had no adjacent label and need manual review`
      )
    }
    const weak = fields.filter((f) => f.confidence < 0.5).length
    if (weak > 0) warnings.push(`${weak} field(s) below 0.5 confidence — review before filling`)
    if (words.length < 5) {
      warnings.push('Very little text detected — the photo may be low-light or skewed')
    }

    return {
      pageWidth: pageWidth > 0 ? pageWidth : W,
      pageHeight: pageHeight > 0 ? pageHeight : H,
      fields,
      tierUsed: 'cv',
      warnings,
    }
  } finally {
    src.delete()
    gray.delete()
    binLines.delete()
    binShapes.delete()
  }
}
