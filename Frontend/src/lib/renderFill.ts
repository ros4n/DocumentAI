import type { FillDecision, FormField } from './formFill'

function loadImage(image: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the form image'))
    img.src = image
  })
}

const INK_LUM = 165

function buildInkMask(image: ImageData): Uint8Array {
  const { width, height, data } = image
  const mask = new Uint8Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    mask[j] = lum < INK_LUM ? 1 : 0
  }
  return mask
}

function centerInkRatio(
  mask: Uint8Array,
  width: number,
  height: number
): number {
  const cx0 = Math.floor(width * 0.2)
  const cy0 = Math.floor(height * 0.2)
  const cx1 = Math.ceil(width * 0.8)
  const cy1 = Math.ceil(height * 0.8)
  let ink = 0
  let total = 0
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      ink += mask[y * width + x]
      total++
    }
  }
  return total > 0 ? ink / total : 0
}

function largestEmptyRect(
  mask: Uint8Array,
  width: number,
  height: number
): { x0: number; y0: number; w: number; h: number } | null {
  const heights = new Int32Array(width)
  let best: { x0: number; y0: number; w: number; h: number; area: number } | null = null
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      heights[x] = mask[y * width + x] === 0 ? heights[x] + 1 : 0
    }
    const stack: number[] = []
    for (let x = 0; x <= width; x++) {
      const h = x < width ? heights[x] : 0
      while (stack.length > 0 && heights[stack[stack.length - 1]] > h) {
        const idx = stack.pop()!
        const rectH = heights[idx]
        const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0
        const rectW = x - left
        const area = rectH * rectW
        if (!best || area > best.area) {
          best = { x0: left, y0: y - rectH + 1, w: rectW, h: rectH, area }
        }
      }
      stack.push(x)
    }
  }
  return best ? { x0: best.x0, y0: best.y0, w: best.w, h: best.h } : null
}

export interface FilledResult {
  dataUrl: string
  skipped: string[]
}

export async function renderFilledForm(
  image: string,
  fields: FormField[],
  decisions: FillDecision[]
): Promise<FilledResult> {
  const img = await loadImage(image)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const toPx = (v: number, dim: number) => (v / 1000) * dim
  const ink = '#1a1a1a'
  const skipped: string[] = []
  const textItems: Array<{
    drawX: number
    drawY: number
    drawW: number
    drawH: number
    value: string
  }> = []

  for (const decision of decisions) {
    const field = fields.find((f) => f.id === decision.fieldId)
    if (!field) continue

    const px1 = toPx(field.bbox[0], canvas.width)
    const py1 = toPx(field.bbox[1], canvas.height)
    const px2 = toPx(field.bbox[2], canvas.width)
    const py2 = toPx(field.bbox[3], canvas.height)
    const w = Math.max(2, px2 - px1)
    const h = Math.max(2, py2 - py1)

    if (field.kind === 'signature') {
      // Signatures are never auto-generated — flagged so the user sees why
      skipped.push(`${field.label || field.id} (signature left blank)`)
      continue
    }

    if (field.kind === 'checkbox') {
      let boxX = px1
      let boxY = py1
      let boxW = w
      let boxH = h
      if (boxW > boxH * 2.5 && boxH >= 6) {
        boxW = boxH
      }
      const regionX = Math.max(0, Math.floor(boxX))
      const regionY = Math.max(0, Math.floor(boxY))
      const regionW = Math.min(canvas.width - regionX, Math.ceil(boxW))
      const regionH = Math.min(canvas.height - regionY, Math.ceil(boxH))
      if (regionW >= 2 && regionH >= 2) {
        const region = ctx.getImageData(regionX, regionY, regionW, regionH)
        const mask = buildInkMask(region)
        if (centerInkRatio(mask, regionW, regionH) > 0.1) {
          skipped.push(field.label || field.id)
          continue
        }
      }
      if (!decision.checked) continue
      const size = Math.min(regionW, regionH) * 0.7
      const cx = regionX + regionW / 2
      const cy = regionY + regionH / 2
      ctx.strokeStyle = ink
      ctx.fillStyle = ink
      ctx.lineWidth = Math.max(2, size * 0.12)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (field.shape === 'radio') {
        ctx.beginPath()
        ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.beginPath()
      ctx.moveTo(cx - size / 2, cy)
      ctx.lineTo(cx - size * 0.12, cy + size * 0.42)
      ctx.lineTo(cx + size / 2, cy - size * 0.42)
      ctx.stroke()
      continue
    }

    const value = decision.value.trim()
    if (!value) continue

    const regionX = Math.max(0, Math.floor(px1))
    const regionY = Math.max(0, Math.floor(py1))
    const regionW = Math.min(canvas.width - regionX, Math.ceil(w))
    const regionH = Math.min(canvas.height - regionY, Math.ceil(h))
    if (regionW < 4 || regionH < 4) {
      skipped.push(field.label || field.id)
      continue
    }

    const region = ctx.getImageData(regionX, regionY, regionW, regionH)
    const mask = buildInkMask(region)
    const emptyRect = largestEmptyRect(mask, regionW, regionH)
    if (
      !emptyRect ||
      emptyRect.w < Math.max(4, Math.floor(regionW * 0.1)) ||
      emptyRect.h < 3
    ) {
      skipped.push(field.label || field.id)
      continue
    }

    textItems.push({
      drawX: regionX + emptyRect.x0,
      drawY: regionY + emptyRect.y0,
      drawW: emptyRect.w,
      drawH: emptyRect.h,
      value,
    })
  }

  const capPx = canvas.height * 0.02
  const fonts = textItems.map((t) => Math.min(t.drawH * 0.72, capPx)).sort((a, b) => a - b)
  const baseFont = fonts.length > 0 ? fonts[Math.floor(fonts.length / 2)] : capPx

  for (const item of textItems) {
    const { drawX, drawY, drawW, drawH } = item
    let fontSize = Math.min(baseFont, drawH * 0.72)
    ctx.font = `${fontSize}px Arial, sans-serif`
    const maxWidth = drawW * 0.94
    while (fontSize > 6 && ctx.measureText(item.value).width > maxWidth) {
      fontSize -= 1
      ctx.font = `${fontSize}px Arial, sans-serif`
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.fillRect(drawX, drawY, drawW, drawH)

    ctx.save()
    ctx.beginPath()
    ctx.rect(drawX, drawY, drawW, drawH)
    ctx.clip()
    ctx.fillStyle = ink
    ctx.textBaseline = 'middle'
    const textY =
      drawH > fontSize * 2.5
        ? drawY + drawH - fontSize * 0.45
        : drawY + drawH / 2
    ctx.fillText(item.value, drawX + drawW * 0.03, textY)
    ctx.restore()
  }

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.95), skipped }
}
