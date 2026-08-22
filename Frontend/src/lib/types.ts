/* ============================================================
   Form Field Detection & Auto-Fill Pipeline — data contracts.
   Every detection tier (acroform / vlm / cv) emits this exact
   shape; formFill.ts and renderFill.ts consume it downstream
   without knowing which tier produced the data.

   Coordinate system: bbox is in PIXELS relative to the source
   image described by FieldDetectionResult.pageWidth/pageHeight.
   For PDF input the page is rasterized at RASTER_SCALE (see
   lib/ocr.ts) so all tiers share one coordinate space.
   ============================================================ */

export type FieldType =
  | 'text_line'
  | 'checkbox'
  | 'radio'
  | 'signature'
  | 'date'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DetectedField {
  id: string
  label: string
  fieldType: FieldType
  bbox: BoundingBox
  groupId?: string
  confidence: number
  source: 'acroform' | 'vlm' | 'cv'
}

export type DetectionTier = 'acroform' | 'vlm' | 'cv'

export interface FieldDetectionResult {
  pageWidth: number
  pageHeight: number
  fields: DetectedField[]
  tierUsed: DetectionTier
  warnings?: string[]
}

export const FIELD_TYPES: FieldType[] = [
  'text_line',
  'checkbox',
  'radio',
  'signature',
  'date',
]

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && (FIELD_TYPES as string[]).includes(value)
}
