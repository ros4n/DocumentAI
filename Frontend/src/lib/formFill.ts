import {
  getOcrWorker,
  serverConfigured,
  serverRecognize,
} from './ocr'
import { chat, extractJson, getLlmConfig, llmConfigured } from './llm'
import type { ProfileData } from './profile'
import type { DetectedField, FieldDetectionResult } from './types'

export interface TextElement {
  text: string
  category?: string
  bbox: [number, number, number, number]
}

export interface FormField {
  id: string
  label: string
  kind: 'text' | 'checkbox' | 'date' | 'signature'
  bbox: [number, number, number, number]
  labelBBox: [number, number, number, number]
  group?: string
  options?: string[]
  shape?: 'checkbox' | 'radio'
}

export function glyphShape(glyph: string): 'checkbox' | 'radio' {
  return /^[○◯●]$/.test(glyph) ? 'radio' : 'checkbox'
}

const MAX_FIELDS = 40

// LLM semantic detection & matching is disabled. The code paths below
// (analyzeForm vision branch, matchFields LLM path) are kept intact for
// future use — flip this to true to re-enable.
const LLM_SEMANTIC_ENABLED = false

function parseBbox(raw: string | undefined): [number, number, number, number] | null {
  if (!raw) return null
  const nums = raw.match(/-?\d+/g)
  if (!nums || nums.length < 4) return null
  return [
    Number(nums[0]),
    Number(nums[1]),
    Number(nums[2]),
    Number(nums[3]),
  ]
}

export function parseGroundingOutput(raw: string): TextElement[] {
  const elements: TextElement[] = []
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*<\|det\|>([^\s\]]+)(?:\s*(\[[^\]]*\]))?\s*<\|\/det\|>\s*(.*)$/)
    if (!m) continue
    const bbox = parseBbox(m[2])
    if (!bbox) continue
    const text = m[3].replace(/<\|ref\|>[^]*?<\|\/ref\|>/g, '').trim()
    if (!text) continue
    elements.push({ text, category: m[1], bbox })
  }
  return elements
}

function mergeLines(elements: TextElement[]): TextElement[] {
  const sorted = [...elements].sort(
    (a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]
  )
  const lines: TextElement[][] = []
  for (const el of sorted) {
    const cy = (el.bbox[1] + el.bbox[3]) / 2
    const line = lines.find((l) => {
      const ly = (l[0].bbox[1] + l[0].bbox[3]) / 2
      return Math.abs(ly - cy) < 25
    })
    if (line) {
      line.push(el)
    } else {
      lines.push([el])
    }
  }
  const merged: TextElement[] = []
  for (const line of lines) {
    let current: TextElement = line[0]
    for (let i = 1; i < line.length; i++) {
      const gap = line[i].bbox[0] - current.bbox[2]
      if (gap < 90) {
        current = {
          text: `${current.text} ${line[i].text}`.trim(),
          bbox: [
            current.bbox[0],
            Math.min(current.bbox[1], line[i].bbox[1]),
            line[i].bbox[2],
            Math.max(current.bbox[3], line[i].bbox[3]),
          ],
        }
      } else {
        merged.push(current)
        current = line[i]
      }
    }
    merged.push(current)
  }
  return merged
}

function labelForRegion(elements: TextElement[], region: TextElement): string {
  let best: TextElement | null = null
  for (const el of elements) {
    if (el === region) continue
    if (el.bbox[3] > region.bbox[1] + 1) continue
    const overlap =
      Math.min(el.bbox[2], region.bbox[2]) - Math.max(el.bbox[0], region.bbox[0])
    if (overlap > 0 && (!best || el.bbox[3] > best.bbox[3])) {
      best = el
    }
  }
  return best ? best.text : ''
}

function labelRightOf(elements: TextElement[], region: TextElement): string {
  let best: TextElement | null = null
  for (const el of elements) {
    if (el === region) continue
    if (el.bbox[0] <= region.bbox[2] + 1) continue
    const yOverlap =
      Math.min(el.bbox[3], region.bbox[3]) - Math.max(el.bbox[1], region.bbox[1])
    if (yOverlap <= 0) continue
    const dist = el.bbox[0] - region.bbox[2]
    if (!best || dist < (best.bbox[0] - region.bbox[2])) {
      best = el
    }
  }
  return best ? best.text : ''
}

function labelLeftOf(elements: TextElement[], region: TextElement): string {
  let best: TextElement | null = null
  for (const el of elements) {
    if (el === region) continue
    if (el.bbox[2] >= region.bbox[0] - 1) continue
    const yOverlap =
      Math.min(el.bbox[3], region.bbox[3]) - Math.max(el.bbox[1], region.bbox[1])
    if (yOverlap <= 0) continue
    const dist = region.bbox[0] - el.bbox[2]
    if (!best || dist < (region.bbox[0] - best.bbox[2])) {
      best = el
    }
  }
  return best ? best.text : ''
}

function splitMidBoxes(elements: TextElement[]): TextElement[] {
  const boxRe = /[□▢◯○●☐☑]/g
  const out: TextElement[] = []
  for (const el of elements) {
    const chars = [...el.text]
    const idxs: number[] = []
    let m: RegExpExecArray | null
    boxRe.lastIndex = 0
    while ((m = boxRe.exec(el.text))) idxs.push(m.index)
    if (
      idxs.length === 0 ||
      (idxs.length === 1 && (idxs[0] === 0 || idxs[0] === chars.length - 1))
    ) {
      out.push(el)
      continue
    }
    const [x1, y1, x2, y2] = el.bbox
    const w = x2 - x1
    const pushSegment = (start: number, end: number) => {
      const seg = chars.slice(start, end).join('')
      if (!seg) return
      out.push({
        text: seg,
        bbox: [
          x1 + (w * start) / chars.length,
          y1,
          x1 + (w * end) / chars.length,
          y2,
        ],
      })
    }
    let segStart = 0
    for (let i = 0; i < chars.length; i++) {
      if (boxRe.test(chars[i])) {
        pushSegment(segStart, i)
        out.push({
          text: chars[i],
          bbox: [
            x1 + (w * (i + 0.2)) / chars.length,
            y1,
            x1 + (w * (i + 0.8)) / chars.length,
            y2,
          ],
        })
        segStart = i + 1
      }
    }
    pushSegment(segStart, chars.length)
  }
  return out
}

export function detectFormFields(elements: TextElement[]): FormField[] {
  const elements2 = splitMidBoxes(elements)
  const fields: FormField[] = []
  const boxes = elements2.map((el) => el.bbox)

  const isBoxElement = (t: string) =>
    /^[□▢◯○●☐☑]$/.test(t.trim()) ||
    /^[□▢◯○●☐☑]\s*\S/.test(t) ||
    /\S\s*[□▢◯○●☐☑]$/.test(t) ||
    /^[Oo0DdQq]\s*\S/.test(t) ||
    /\S\s*[Oo0DdQq]$/.test(t)

  const groups = new Map<TextElement, string>()
  {
    const lineLists: TextElement[][] = []
    for (const el of elements2) {
      const cy = (el.bbox[1] + el.bbox[3]) / 2
      const line = lineLists.find((l) => {
        const ly = (l[0].bbox[1] + l[0].bbox[3]) / 2
        return Math.abs(ly - cy) < 25
      })
      if (line) line.push(el)
      else lineLists.push([el])
    }
    for (const line of lineLists) {
      line.sort((a, b) => a.bbox[0] - b.bbox[0])
      const firstIdx = line.findIndex((el) => isBoxElement(el.text))
      if (firstIdx < 0) continue
      const firstBox = line[firstIdx]
      const questionText = line
        .slice(0, firstIdx)
        .map((el) => el.text)
        .join(' ')
        .replace(/[:：]\s*$/, '')
      let group = questionText
      if (!group) {
        const above = elements2
          .filter((el) => {
            if (isBoxElement(el.text.trim())) return false
            if (el.bbox[3] >= firstBox.bbox[1] + 1) return false
            const gap = firstBox.bbox[1] - el.bbox[3]
            if (gap < 0 || gap > 150) return false
            const t = el.text.trim()
            if (t.length === 0 || (t.length > 24 && !/[:：]$/.test(t))) return false
            const hasBoxLeft = elements2.some(
              (o) =>
                o !== el &&
                isBoxElement(o.text) &&
                o.bbox[2] <= el.bbox[0] + 1 &&
                Math.abs(
                  (o.bbox[1] + o.bbox[3]) / 2 - (el.bbox[1] + el.bbox[3]) / 2
                ) < 25
            )
            return !hasBoxLeft
          })
          .filter(
            (el) =>
              Math.min(el.bbox[2], firstBox.bbox[2]) - Math.max(el.bbox[0], firstBox.bbox[0]) >
                0 || el.bbox[0] <= firstBox.bbox[0]
          )
          .sort((a, b) => b.bbox[3] - a.bbox[3])
        if (above.length > 0) group = above[0].text.replace(/[:：]\s*$/, '')
      }
      for (const el of line) {
        if (isBoxElement(el.text)) groups.set(el, group)
      }
    }
  }

  for (const el of elements2) {
    if (fields.length >= MAX_FIELDS) break
    const text = el.text.trim()
    if (!text) continue

    const [x1, y1, x2, y2] = el.bbox

    const isCheckbox = /^[□▢◯○●☐☑Oo0DdQq]$/.test(text)
    const boxPrefix = text.match(/^([□▢◯○●☐☑])(?:\s*)(.+)$/)
    const boxSuffix = text.match(/^(.+?)(?:\s*)([□▢◯○●☐☑])$/)
    const misreadPrefix = text.match(/^([Oo0DdQq])\s*(\S{1,24}(?:\s+\S{1,12})?)$/)
    const misreadSuffix = text.match(/^(\S{1,24}(?:\s+\S{1,12})?)\s*([Oo0DdQq])$/)
    const isUnderline = /^[_\u2013\u2014-]{2,}$/.test(text)

    let rightBound = 1000
    for (const b of boxes) {
      if (b === el.bbox) continue
      if (b[2] <= x1 + 1) continue
      if (b[3] < y1 - 8 || b[1] > y2 + 8) continue
      if (b[0] > x1 && b[0] < rightBound) rightBound = b[0]
    }
    const blankWidth = rightBound - x2

    if (isCheckbox || boxPrefix || boxSuffix || misreadPrefix || misreadSuffix) {
      let label: string
      let bbox: [number, number, number, number]
      const boxSize = Math.min(y2 - y1, 60)
      if (isCheckbox) {
        label = labelRightOf(elements, el) || labelLeftOf(elements, el)
        bbox = el.bbox
      } else if (boxPrefix) {
        label = boxPrefix[2]
        bbox = [x1, y1, Math.min(x2, x1 + boxSize), y2]
      } else if (boxSuffix) {
        label = boxSuffix[1]
        bbox = [Math.max(x1, x2 - boxSize), y1, x2, y2]
      } else if (misreadPrefix) {
        label = misreadPrefix[2]
        bbox = [x1, y1, Math.min(x2, x1 + boxSize), y2]
      } else {
        label = misreadSuffix![1]
        bbox = [Math.max(x1, x2 - boxSize), y1, x2, y2]
      }
      const glyph =
        boxPrefix?.[1] ?? boxSuffix?.[2] ?? (isCheckbox ? text : '')
      fields.push({
        id: `field-${fields.length}`,
        label: label.trim(),
        kind: 'checkbox',
        shape: glyphShape(glyph),
        bbox,
        labelBBox: el.bbox,
        group: groups.get(el) ?? '',
      })
      continue
    }

    if (isUnderline) {
      const lineHeight = y2 - y1
      fields.push({
        id: `field-${fields.length}`,
        label: labelForRegion(elements, el),
        kind: 'text',
        bbox: [x1, y1 - lineHeight * 3, x2, y1],
        labelBBox: el.bbox,
      })
      continue
    }

    const endsWithColon = text.endsWith(':') || text.endsWith('：')
    const labelText = text.replace(/[:：]\s*$/, '')
    const dateLike =
      /\b(date|dob|birth|expiry|expiration)\b/i.test(labelText) ||
      /(mm\/dd|yyyy|yy\/)/i.test(labelText)

    if ((endsWithColon || text.length <= 20) && blankWidth > 60) {
      if (blankWidth > 450 && text.length > 30) continue
      fields.push({
        id: `field-${fields.length}`,
        label: labelText,
        kind: dateLike ? 'date' : 'text',
        bbox: [x2, y1 - 8, Math.min(rightBound - 4, x2 + blankWidth), y2 + 8],
        labelBBox: el.bbox,
      })
    }
  }

  const checkboxGroupLabels = new Set(
    fields
      .filter((f) => f.kind === 'checkbox' && f.group)
      .map((f) => normalize(f.group as string))
      .filter(Boolean)
  )
  return fields.filter(
    (f) =>
      f.kind === 'checkbox' ||
      !checkboxGroupLabels.has(normalize(f.label))
  )
}

const UNDERLINE_RE = /^[_\u2013\u2014-]{2,}$/

function isBoxishElement(text: string): boolean {
  return /^[□▢◯○●☐☑Oo0DdQq]$/.test(text)
}

/**
 * LLM (vision) bboxes are approximate: often the whole line, just the label,
 * or a tall box spanning several rows. Snap each text/date field onto the
 * real OCR layout: one writing row, starting after the label, bounded by ink.
 */
export function snapLlmFieldsToLayout(
  fields: FormField[],
  elements: TextElement[]
): FormField[] {
  if (elements.length === 0) return fields

  const sorted = [...elements].sort((a, b) => a.bbox[1] - b.bbox[1])
  const rows: TextElement[][] = []
  for (const el of sorted) {
    const cy = (el.bbox[1] + el.bbox[3]) / 2
    const row = rows.find(
      (r) => Math.abs((r[0].bbox[1] + r[0].bbox[3]) / 2 - cy) < 25
    )
    if (row) row.push(el)
    else rows.push([el])
  }
  const heights = elements
    .map((el) => el.bbox[3] - el.bbox[1])
    .sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)] || 20

  return fields.map((field) => {
    if (field.kind === 'checkbox') return field
    const [fx1, fy1, fx2, fy2] = field.bbox
    const fcy = (fy1 + fy2) / 2
    const fh = fy2 - fy1

    const overlapping = rows.filter((r) => {
      const top = Math.min(...r.map((e) => e.bbox[1]))
      const bottom = Math.max(...r.map((e) => e.bbox[3]))
      return bottom > fy1 && top < fy2
    })
    if (overlapping.length === 0) return field

    const underlineRow = overlapping.find((r) =>
      UNDERLINE_RE.test(r.map((e) => e.text).join(' ').trim())
    )
    let row: TextElement[]
    if (underlineRow) {
      row = underlineRow
    } else if (fh >= medianH * 3) {
      row = overlapping[0]
    } else {
      let best = overlapping[0]
      let bestDist = Infinity
      for (const r of overlapping) {
        const top = Math.min(...r.map((e) => e.bbox[1]))
        const bottom = Math.max(...r.map((e) => e.bbox[3]))
        const d = Math.abs((top + bottom) / 2 - fcy)
        if (d < bestDist) {
          bestDist = d
          best = r
        }
      }
      row = best
    }

    const rowTop = Math.min(...row.map((e) => e.bbox[1]))
    const rowBottom = Math.max(...row.map((e) => e.bbox[3]))
    const rowText = row.map((e) => e.text).join(' ')

    if (UNDERLINE_RE.test(rowText.trim())) {
      const lineH = Math.max(4, rowBottom - rowTop)
      const ux1 = Math.max(fx1, Math.min(...row.map((e) => e.bbox[0])))
      const ux2 = Math.min(fx2, Math.max(...row.map((e) => e.bbox[2])))
      return {
        ...field,
        bbox: [ux1, rowTop - lineH * 3, Math.max(ux1 + 2, ux2), rowTop],
      }
    }

    const overlapWords = row.filter(
      (e) => !isBoxishElement(e.text) && e.bbox[0] < fx2 && e.bbox[2] > fx1
    )
    let labelEnd: number
    if (overlapWords.length > 0) {
      labelEnd = Math.max(...overlapWords.map((e) => e.bbox[2]))
    } else {
      const leftWords = row.filter(
        (e) => !isBoxishElement(e.text) && e.bbox[2] <= fx1 + 1
      )
      labelEnd = leftWords.length > 0 ? Math.max(...leftWords.map((e) => e.bbox[2])) : fx1
    }

    const labelFillsBox = labelEnd >= fx2 - 4
    let rightBound = labelFillsBox ? 1000 : fx2
    for (const e of row) {
      if (isBoxishElement(e.text)) continue
      if (e.bbox[0] > labelEnd + 1 && e.bbox[0] < rightBound) {
        rightBound = e.bbox[0]
      }
    }
    let newX1 = Math.max(labelEnd + 2, fx1)
    let newX2 = labelFillsBox
      ? Math.min(rightBound - 2, Math.min(1000, fx2 + 600))
      : Math.min(rightBound - 2, fx2)
    if (newX2 <= newX1 + 4) {
      newX1 = fx1
      newX2 = fx2
    }
    return { ...field, bbox: [newX1, rowTop - 8, newX2, rowBottom + 8] }
  })
}

function imageDimensions(image: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not load the image'))
    img.src = image
  })
}

export async function extractTesseractLayout(
  image: string
): Promise<TextElement[]> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(image, undefined, { blocks: true })
  const dims = await imageDimensions(image)
  const toEl = (text: string, b: { x0: number; y0: number; x1: number; y1: number }): TextElement => ({
    text,
    bbox: [
      (b.x0 / dims.width) * 1000,
      (b.y0 / dims.height) * 1000,
      (b.x1 / dims.width) * 1000,
      (b.y1 / dims.height) * 1000,
    ],
  })
  const textWords: TextElement[] = []
  const boxWords: TextElement[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          if (word.confidence < 40) continue
          if (!word.text.trim()) continue
          const b = word.bbox
          const t = word.text.trim()
          const bw = b.x1 - b.x0
          const bh = b.y1 - b.y0
          const boxLike =
            /^[□▢◯○●☐☑Oo0DdQq]$/.test(t) && bh > 0 && bw / bh >= 0.6 && bw / bh <= 1.6
          if (boxLike) {
            boxWords.push(toEl(/^[○◯●]$/.test(t) ? '○' : '☐', b))
          } else {
            textWords.push(toEl(t, b))
          }
        }
      }
    }
  }
  return [...mergeLines(textWords), ...boxWords]
}

export async function parseFormStructure(
  image: string
): Promise<{ fields: FormField[]; engine: 'server' | 'on-device' }> {
  if (serverConfigured()) {
    try {
      const raw = await serverRecognize([image], ' document parsing.')
      const elements = mergeLines(parseGroundingOutput(raw))
      if (elements.length > 0) {
        return { fields: detectFormFields(elements), engine: 'server' }
      }
    } catch {
      /* fall through to on-device */
    }
  }
  const elements = await extractTesseractLayout(image)
  return { fields: detectFormFields(elements), engine: 'on-device' }
}

/* ============ MATCHING ============ */

export interface FillDecision {
  fieldId: string
  value: string
  checked: boolean
  confidence: number
}

export interface MatchResult {
  decisions: FillDecision[]
  source: 'llm' | 'heuristic'
  error?: string
}

type TextProfileKey = Exclude<keyof ProfileData, 'customFields'>

const KEYWORD_MAP: Array<[string[], TextProfileKey]> = [
  [['full name', 'legal name', 'name'], 'fullName'],
  [['first name', 'given name'], 'firstName'],
  [['last name', 'surname', 'family name'], 'lastName'],
  [['email', 'e mail', 'e-mail'], 'email'],
  [['phone', 'mobile', 'telephone', 'tel', 'cell'], 'phone'],
  [['date of birth', 'dob', 'birth date', 'birthday', 'birth'], 'dob'],
  [['address', 'street', 'residence'], 'address'],
  [['city'], 'city'],
  [['state', 'province'], 'state'],
  [['zip', 'postal'], 'zip'],
  [['country'], 'country'],
  [['nationality'], 'nationality'],
  [['employer', 'company', 'organization', 'organisation', 'business name'], 'employer'],
  [['occupation', 'job title', 'profession', 'position'], 'occupation'],
  [['gender', 'sex'], 'gender'],
  [['marital status', 'married'], 'maritalStatus'],
  [['id number', 'id no', 'identification', 'passport', 'license number', 'ssn', 'social security'], 'idNumber'],
]

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const OPTION_MAP: Record<string, string[]> = {
  gender: ['Male', 'Female', 'Other'],
  maritalStatus: ['Single', 'Married', 'Divorced', 'Widowed'],
}

export function suggestOptions(
  field: FormField,
  profile: ProfileData,
  llmOptions?: string[]
): string[] {
  if (llmOptions && llmOptions.length > 0) return llmOptions
  const label = normalize(field.label)
  for (const [keywords, key] of KEYWORD_MAP) {
    if (keywords.some((k) => label.includes(k))) {
      const preset = OPTION_MAP[key]
      if (preset && preset.length > 0) {
        const pv = profile[key].trim()
        if (pv && !preset.includes(pv)) return [...preset, pv]
        return preset
      }
      const pv = profile[key].trim()
      if (pv) return [pv]
      break
    }
  }
  if (field.kind === 'checkbox' && field.group) return []
  const profileValues = Object.values(profile)
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0 && v.length <= 30)
  return Array.from(new Set(profileValues)).slice(0, 12)
}

function isYes(value: string): boolean {
  return /^(yes|y|married|single|male|female|true|1|checked)$/i.test(value.trim())
}

function scoreOption(option: string, profileValue: string): number {
  if (!option || !profileValue) return 0
  if (option === profileValue) return 1
  const shorts: Record<string, string> = { m: 'male', f: 'female' }
  if (shorts[option] === profileValue) return 0.9
  if (option.includes(profileValue) || profileValue.includes(option)) return 0.9
  if (option.startsWith(profileValue) || profileValue.startsWith(option)) return 0.8
  return 0
}

export function heuristicMatch(
  fields: FormField[],
  profile: ProfileData
): FillDecision[] {
  const decisions = fields.map((field) => {
    const label = normalize(field.label)
    if (field.kind === 'signature') {
      // Signatures are never auto-filled — product decision, flagged for review
      return { fieldId: field.id, value: '', checked: false, confidence: 0 }
    }
    if (field.kind === 'checkbox') {
      for (const [keywords, key] of KEYWORD_MAP) {
        if (keywords.some((k) => label.includes(k))) {
          const profileValue = profile[key].trim()
          if (profileValue && (label.includes(normalize(profileValue)) || isYes(profileValue))) {
            return { fieldId: field.id, value: '', checked: true, confidence: 0.8 }
          }
          if (label.includes('male') || label.includes('female')) {
            return {
              fieldId: field.id,
              value: '',
              checked: normalize(profile.gender) === label.split(/\s+/)[0],
              confidence: 0.7,
            }
          }
        }
      }
      const genderNorm = normalize(profile.gender)
      const maritalNorm = normalize(profile.maritalStatus)
      if (
        (genderNorm && (label === genderNorm || label.startsWith(genderNorm + ' '))) ||
        (maritalNorm && label === maritalNorm)
      ) {
        return { fieldId: field.id, value: '', checked: true, confidence: 0.7 }
      }
      return { fieldId: field.id, value: '', checked: false, confidence: 0 }
    }

    for (const [keywords, key] of KEYWORD_MAP) {
      if (keywords.some((k) => label.includes(k))) {
        const value = profile[key].trim()
        if (value) {
          return { fieldId: field.id, value, checked: false, confidence: 0.7 }
        }
      }
    }
    for (const custom of profile.customFields) {
      const cLabel = normalize(custom.label)
      const cValue = custom.value.trim()
      if (!cLabel || !cValue) continue
      if (label.includes(cLabel) || label.includes(normalize(cValue))) {
        return { fieldId: field.id, value: cValue, checked: false, confidence: 0.65 }
      }
    }
    return { fieldId: field.id, value: '', checked: false, confidence: 0 }
  })

  const groups = new Map<string, FormField[]>()
  for (const f of fields) {
    if (f.kind !== 'checkbox' || !f.group) continue
    const key = normalize(f.group)
    if (!key) continue
    const arr = groups.get(key)
    if (arr) arr.push(f)
    else groups.set(key, [f])
  }
  for (const [key, groupFields] of groups) {
    const entry = KEYWORD_MAP.find(([keywords]) => keywords.some((k) => key.includes(k)))
    if (!entry) continue
    const profileValue = normalize(profile[entry[1]])
    if (!profileValue) continue
    const scored = groupFields
      .map((f) => ({ f, score: scoreOption(normalize(f.label), profileValue) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
    if (scored.length === 0) continue
    const top = scored[0].score
    const winners = new Set(scored.filter((s) => s.score === top).map((s) => s.f.id))
    for (const f of groupFields) {
      const d = decisions.find((x) => x.fieldId === f.id)
      if (!d) continue
      if (winners.has(f.id)) {
        d.checked = true
        d.confidence = Math.max(d.confidence, 0.75)
      } else {
        d.checked = false
        d.confidence = Math.min(d.confidence, 0.1)
      }
    }
  }

  return decisions
}

function parseLlmDecisions(
  raw: unknown,
  fields: FormField[]
): Map<string, FillDecision> {
  const map = new Map<string, FillDecision>()
  if (!Array.isArray(raw)) return map
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const fieldId = typeof rec.fieldId === 'string' ? rec.fieldId : ''
    if (!fieldId || !fields.some((f) => f.id === fieldId)) continue
    const value = typeof rec.value === 'string' ? rec.value : ''
    const checked = rec.checked === true || rec.checked === 'true' || rec.checked === 1
    const confidence =
      typeof rec.confidence === 'number' ? Math.min(1, Math.max(0, rec.confidence)) : 0.5
    map.set(fieldId, { fieldId, value, checked, confidence })
  }
  return map
}

export async function matchFields(
  fields: FormField[],
  profile: ProfileData,
  image?: string
): Promise<MatchResult> {
  const config = getLlmConfig()
  const fallback = (): MatchResult => ({
    decisions: heuristicMatch(fields, profile),
    source: 'heuristic',
  })

  if (!LLM_SEMANTIC_ENABLED || !llmConfigured() || fields.length === 0) {
    return fallback()
  }

  const fieldList = JSON.stringify(
    fields.map((f) => ({ id: f.id, label: f.label, kind: f.kind, group: f.group ?? '' }))
  )
  const profileJson = JSON.stringify(profile)
  const prompt =
    `You are a form-filling assistant. The user profile JSON is: ${profileJson}\n\n` +
    `The form has these fields: ${fieldList}\n\n` +
    `Decide what to fill in each field from the profile. Match by meaning (e.g. "Surname" -> lastName). ` +
    `For checkbox fields set "checked": true/false and "value": "". ` +
    `Checkbox options sharing the same "group" (e.g. group "Gender" with options Male/Female) form a ` +
    `single-choice question: tick exactly the one option matching the profile, leave the rest unchecked. ` +
    `Never write a word into a checkbox field. ` +
    `For fields with no suitable profile value use "value": "". ` +
    `Return ONLY valid JSON, an array: [{"fieldId":"...","value":"...","checked":false,"confidence":0.9}]`

  try {
    let raw: string
    if (config.vision && image) {
      raw = await chat([
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: prompt },
          ],
        },
      ])
    } else {
      raw = await chat([{ role: 'user', content: prompt }])
    }
    const parsed = extractJson(raw)
    const llmMap = parseLlmDecisions(parsed, fields)
    if (llmMap.size === 0) return fallback()
    const decisions = fields.map((field) => {
      const d = llmMap.get(field.id)
      if (d) return d
      const heuristic = heuristicMatch([field], profile)[0]
      return { fieldId: field.id, value: '', checked: false, confidence: heuristic.confidence }
    })
    return { decisions, source: 'llm' }
  } catch (err) {
    const fallbackResult = fallback()
    fallbackResult.error = (err as Error).message
    return fallbackResult
  }
}

export interface FormAnalysis {
  fields: FormField[]
  decisions: FillDecision[]
  structureEngine: 'server' | 'on-device' | 'llm'
  matchSource: 'llm' | 'heuristic'
  error?: string
  detectionWarnings?: string[]
}

interface LlmFieldEntry extends Record<string, unknown> {
  id: string
  label?: unknown
  kind?: unknown
  bbox?: unknown
  options?: unknown
  shape?: unknown
}

function parseLlmFormStructure(raw: unknown): FormField[] | null {
  if (!Array.isArray(raw)) return null
  const fields: FormField[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as LlmFieldEntry
    if (typeof rec.id !== 'string' || !rec.bbox) continue
    const nums = String(rec.bbox).match(/-?\d+(?:\.\d+)?/g)
    if (!nums || nums.length < 4) continue
    const bbox: [number, number, number, number] = [
      Number(nums[0]),
      Number(nums[1]),
      Number(nums[2]),
      Number(nums[3]),
    ]
    const kind = rec.kind === 'checkbox' || rec.kind === 'date' ? rec.kind : 'text'
    const group = typeof rec.group === 'string' ? rec.group : ''
    const options = Array.isArray(rec.options)
      ? rec.options.filter((o): o is string => typeof o === 'string').slice(0, 20)
      : undefined
    let fieldBBox: [number, number, number, number] = bbox
    if (kind === 'checkbox' && bbox[2] - bbox[0] > (bbox[3] - bbox[1]) * 2.5) {
      const h = bbox[3] - bbox[1]
      fieldBBox = [bbox[0], bbox[1], bbox[0] + h, bbox[3]]
    }
    fields.push({
      id: rec.id,
      label: typeof rec.label === 'string' ? rec.label : '',
      kind,
      shape: rec.shape === 'radio' ? 'radio' : 'checkbox',
      bbox: fieldBBox,
      labelBBox: bbox,
      group,
      options,
    })
  }
  return fields.length > 0 ? fields : null
}

export async function analyzeForm(
  image: string,
  profile: ProfileData
): Promise<FormAnalysis> {
  const config = getLlmConfig()

  if (LLM_SEMANTIC_ENABLED && llmConfigured() && config.vision) {
    const profileJson = JSON.stringify(profile)
    const prompt =
      `You are a form-filling assistant. Here is a scanned form image (coordinates are normalized 0-1000).\n` +
      `User profile JSON: ${profileJson}\n\n` +
      `1. Detect every fillable field. A "text" field is a label with a blank writing line; ` +
      `its bbox must be ONLY the blank writing line (where a value is written): it starts just after the ` +
      `label text, ends at the end of the blank, its height is exactly one text-line height, and it is ` +
      `vertically centered on the label's text line. Never include the label itself, other rows, or ` +
      `neighboring fields in the bbox. If the blank is a printed underline (e.g. ____), the bbox must ` +
      `sit on that underline row (just above the underline). ` +
      `A "checkbox" field is a tick-box symbol (□, ☐) only — its bbox is JUST the small symbol box. ` +
      `A "radio" option is a circle (○, ◯) — also kind "checkbox" but with "shape":"radio" and bbox = the small circle. ` +
      `Square boxes use "shape":"checkbox". ` +
      `Its label is the option text beside it with the question prefixed, e.g. label "Gender: Male". ` +
      `Checkbox options that belong to the same question share the same "group" (e.g. "Gender"). ` +
      `2. Decide the value for each field from the profile (match by meaning). ` +
      `For checkboxes set "checked": true/false and "value": "". Tick the one option that matches the ` +
      `profile within each group; never write a word into a checkbox. ` +
      `Optionally, for text fields you may provide "options": an array of plausible choices for manual selection. ` +
      `Return ONLY valid JSON: {"fields":[{"id":"f0","label":"Name","kind":"text","bbox":[x1,y1,x2,y2],"options":[]}],` +
      `"decisions":[{"fieldId":"f0","value":"John Doe","checked":false,"confidence":0.95}]}` +
      ` Example checkbox entry: {"id":"f3","label":"Gender: Male","kind":"checkbox","shape":"radio","bbox":[x1,y1,x2,y2],"group":"Gender"}`

    try {
      const raw = await chat([
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: prompt },
          ],
        },
      ])
      const parsed = extractJson(raw)
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        const llmFields = parseLlmFormStructure(obj.fields)
        const llmMap = parseLlmDecisions(obj.decisions, llmFields ?? [])
        if (llmFields && llmFields.length > 0) {
          let fields = llmFields
          try {
            const elements = await extractTesseractLayout(image)
            fields = snapLlmFieldsToLayout(llmFields, elements)
          } catch {
            /* keep LLM bboxes */
          }
          const checkboxFields = fields.filter((f) => f.kind === 'checkbox')
          if (checkboxFields.length > 0) {
            for (const f of fields) {
              if (f.kind !== 'text') continue
              const d = llmMap.get(f.id)
              if (!d || !d.value) continue
              const v = normalize(d.value)
              for (const cf of checkboxFields) {
                if (normalize(cf.label) !== v) continue
                const overlap =
                  f.bbox[0] < cf.bbox[2] &&
                  f.bbox[2] > cf.bbox[0] &&
                  f.bbox[1] < cf.bbox[3] &&
                  f.bbox[3] > cf.bbox[1]
                if (!overlap) continue
                llmMap.set(f.id, { ...d, value: '', confidence: 0 })
              }
            }
          }
          const decisions = fields.map((field) => {
            const d = llmMap.get(field.id)
            if (d) return d
            return { fieldId: field.id, value: '', checked: false, confidence: 0 }
          })
          return {
            fields,
            decisions,
            structureEngine: 'llm',
            matchSource: 'llm',
          }
        }
      }
    } catch {
      /* fall through to OCR paths */
    }
  }

  const { fields, engine } = await parseFormStructure(image)
  const match = await matchFields(
    fields,
    profile,
    LLM_SEMANTIC_ENABLED && config.vision ? image : undefined
  )
  return {
    fields,
    decisions: match.decisions,
    structureEngine: engine,
    matchSource: match.source,
    error: match.error,
  }
}

/* ============ DETECTED-FIELD PIPELINE (fieldDetect contract) ============ */

/**
 * Convert the unified DetectedField[] contract (pixel bboxes, lib/types.ts)
 * into the internal FormField layout this module's matching + rendering
 * pipeline consumes (normalized 0–1000 coordinate space). This is the only
 * place the two shapes meet — every detection tier funnels through here.
 */
export function detectedToFormFields(
  detection: FieldDetectionResult
): FormField[] {
  const sx = 1000 / Math.max(1, detection.pageWidth)
  const sy = 1000 / Math.max(1, detection.pageHeight)
  return detection.fields.map((f: DetectedField, i) => {
    const x1 = f.bbox.x * sx
    const y1 = f.bbox.y * sy
    const x2 = (f.bbox.x + f.bbox.width) * sx
    const y2 = (f.bbox.y + f.bbox.height) * sy
    return {
      id: f.id || `field-${i}`,
      label: f.label,
      kind:
        f.fieldType === 'text_line'
          ? 'text'
          : f.fieldType === 'radio'
            ? 'checkbox'
            : f.fieldType,
      shape: f.fieldType === 'radio' ? 'radio' : 'checkbox',
      bbox: [x1, y1, x2, y2] as [number, number, number, number],
      labelBBox: [x1, y1 - sy * 4, x2, y1] as [number, number, number, number],
      group: f.groupId ?? '',
    }
  })
}

/**
 * Analyze a form whose fields were already produced by the field-detection
 * pipeline (Tier 0 acroform / Tier 1 VLM / Tier 2 OpenCV). Only value
 * matching runs here — detection already happened upstream.
 */
export async function analyzeDetectedFields(
  detection: FieldDetectionResult,
  profile: ProfileData
): Promise<FormAnalysis> {
  if (detection.fields.length === 0) {
    return {
      fields: [],
      decisions: [],
      structureEngine: 'on-device',
      matchSource: 'heuristic',
      detectionWarnings: [
        ...(detection.warnings ?? []),
        'No fillable fields were detected',
      ],
    }
  }
  const fields = detectedToFormFields(detection)
  const match = await matchFields(fields, profile)
  return {
    fields,
    decisions: match.decisions,
    structureEngine: detection.tierUsed === 'cv' ? 'on-device' : 'server',
    matchSource: match.source,
    error: match.error,
    detectionWarnings: detection.warnings,
  }
}
