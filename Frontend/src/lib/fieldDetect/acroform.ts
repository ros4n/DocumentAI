import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFOptionList,
  PDFName,
  PDFRadioGroup,
  PDFSignature,
  PDFString,
  PDFHexString,
  PDFTextField,
} from 'pdf-lib'

import type { DetectedField, FieldDetectionResult } from '../types'
import type { RasterizedPage } from '../ocr'

const DATE_HINT_RE =
  /\b(date|dob|birth|expir|expiration|effective|issued|yyyy|mm[\/\-. ]dd|dd[\/\-. ]mm)\b/i

/** Strip XFA-derived internal path prefixes like `topmostSubform[0].Page1[0].` */
export function cleanFieldName(rawName: string): string {
  let name = rawName
  // Drop every segment ending in [digits] along a dotted path
  const segments = name.split(/[.#]/)
  const kept = segments.filter((seg) => seg && !/\[\d+\]$/.test(seg.trim()))
  if (kept.length > 0) name = kept.join(' ')
  else name = segments[segments.length - 1] ?? rawName
  // Humanize leftovers: snake_case / camelCase / junk suffixes
  name = name
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s*\b[a-f0-9]{6,}\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return name
}

function readTooltip(field: PDFField): string {
  try {
    const tu = field.acroField.dict.lookupMaybe(PDFName.of('TU'), PDFString, PDFHexString)
    if (!tu) return ''
    return tu.decodeText().trim()
  } catch {
    return ''
  }
}

interface WidgetRect {
  x: number
  y: number
  width: number
  height: number
}

function widgetRects(field: PDFField): WidgetRect[] {
  try {
    return field.acroField.getWidgets().map((widget) => {
      const rect = widget.getRectangle()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
  } catch {
    return []
  }
}

/**
 * Tier 0 â€” extract real AcroForm fields from a digital PDF. No OCR/CV needed.
 * Coordinates are converted from PDF points (origin bottom-left) into pixels
 * relative to the provided rasterized page render (origin top-left), so the
 * output matches every other tier's coordinate space exactly.
 */
export async function tryAcroFormExtraction(
  file: File | Blob,
  renderedPage: RasterizedPage
): Promise<FieldDetectionResult | null> {
  let doc: PDFDocument
  try {
    const bytes = await file.arrayBuffer()
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    if (!doc.getForm()) return null
  } catch {
    return null
  }

  const warnings: string[] = []
  const fields: DetectedField[] = []

  let formFields: PDFField[]
  try {
    formFields = doc.getForm().getFields()
  } catch {
    return null
  }
  if (formFields.length === 0) return null

  // Scale factors: PDF points -> rasterized pixels
  let pageWidthPt = 612
  let pageHeightPt = 792
  try {
    const page = doc.getPage(0)
    const size = page.getSize()
    pageWidthPt = size.width
    pageHeightPt = size.height
  } catch {
    /* keep letter defaults */
  }
  const scaleX = renderedPage.width / pageWidthPt
  const scaleY = renderedPage.height / pageHeightPt

  const toPixelBoxTopLeft = (r: WidgetRect) => ({
    x: Math.round(r.x * scaleX),
    y: Math.round((pageHeightPt - r.y - r.height) * scaleY),
    width: Math.max(2, Math.round(r.width * scaleX)),
    height: Math.max(2, Math.round(r.height * scaleY)),
  })

  let index = 0
  for (const field of formFields) {
    const rawName = field.getName() || ''
    const tooltip = readTooltip(field)
    const cleanName = cleanFieldName(rawName)
    const hintText = `${tooltip} ${rawName}`
    const isDateLike = DATE_HINT_RE.test(hintText)

    if (field instanceof PDFRadioGroup) {
      let optionCount = 0
      try {
        const widgets = field.acroField.getWidgets()
        for (let wi = 0; wi < widgets.length; wi++) {
          const rect = widgets[wi].getRectangle()
          if (rect.width <= 1 || rect.height <= 1) continue
          let optionLabel = ''
          try {
            const onValue = (
              field.acroField as unknown as {
                getOnValue?: (idx: number) => { asString?: () => string } | undefined
              }
            ).getOnValue?.(wi)
            const s = onValue?.asString?.()
            if (s) optionLabel = cleanFieldName(s)
          } catch {
            /* keep fallback label */
          }
          fields.push({
            id: `field_${index++}`,
            label: optionLabel || `${cleanName || 'Option'} ${optionCount + 1}`,
            fieldType: 'radio',
            bbox: toPixelBoxTopLeft({
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }),
            groupId: cleanName || 'group',
            confidence: tooltip ? 1 : 0.95,
            source: 'acroform',
          })
          optionCount++
        }
      } catch {
        /* skip unreadable radio group */
      }
      continue
    }

    if (field instanceof PDFCheckBox) {
      for (const rect of widgetRects(field)) {
        if (rect.width <= 1 || rect.height <= 1) continue
        fields.push({
          id: `field_${index++}`,
          label: tooltip || cleanName,
          fieldType: 'checkbox',
          bbox: toPixelBoxTopLeft(rect),
          confidence: tooltip ? 1 : 0.95,
          source: 'acroform',
        })
      }
      continue
    }

    if (field instanceof PDFTextField) {
      let value = ''
      try {
        value = field.getText()?.trim() ?? ''
      } catch {
        /* unreadable */
      }
      if (value) continue // already filled â€” spec says detect blank fields only
      for (const rect of widgetRects(field)) {
        if (rect.height <= 1) continue
        fields.push({
          id: `field_${index++}`,
          label: tooltip || cleanName,
          fieldType: isDateLike ? 'date' : 'text_line',
          bbox: toPixelBoxTopLeft(rect),
          confidence: tooltip ? 1 : 0.95,
          source: 'acroform',
        })
      }
      continue
    }

    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      for (const rect of widgetRects(field)) {
        if (rect.height <= 1) continue
        fields.push({
          id: `field_${index++}`,
          label: tooltip || cleanName,
          fieldType: 'text_line',
          bbox: toPixelBoxTopLeft(rect),
          confidence: 0.9,
          source: 'acroform',
        })
      }
      continue
    }

    if (
      field instanceof PDFSignature ||
      field instanceof PDFButton ||
      /sign/i.test(hintText)
    ) {
      for (const rect of widgetRects(field)) {
        if (rect.width <= 1 || rect.height <= 1) continue
        fields.push({
          id: `field_${index++}`,
          label: tooltip || cleanName || 'Signature',
          fieldType: 'signature',
          bbox: toPixelBoxTopLeft(rect),
          confidence: 0.95,
          source: 'acroform',
        })
      }
      continue
    }

    // Unknown field type â€” expose as a text line so nothing silently vanishes
    for (const rect of widgetRects(field)) {
      if (rect.height <= 1) continue
      fields.push({
        id: `field_${index++}`,
        label: tooltip || cleanName,
        fieldType: 'text_line',
        bbox: toPixelBoxTopLeft(rect),
        confidence: 0.7,
        source: 'acroform',
      })
    }
  }

  if (fields.length === 0) return null


  warnings.push(`Extracted ${fields.length} interactive AcroForm field(s) â€” highest accuracy tier`)
  return {
    pageWidth: renderedPage.width,
    pageHeight: renderedPage.height,
    fields,
    tierUsed: 'acroform',
    warnings,
  }
}
