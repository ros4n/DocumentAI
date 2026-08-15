import type { Worker } from 'tesseract.js'

const SERVER_KEY = 'snappy:ocrServerUrl'
const SERVER_MODEL = 'Unlimited-OCR'

export interface OcrResult {
  text: string
  engine: 'server' | 'on-device'
  pages: number
  serverError?: string
}

let workerPromise: Promise<Worker> | null = null

async function loadPdfJs() {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
  return pdfjsLib
}

export function getServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setServerUrl(url: string): void {
  try {
    localStorage.setItem(SERVER_KEY, url.trim().replace(/\/+$/, ''))
  } catch {
    /* storage unavailable */
  }
}

export function serverConfigured(): boolean {
  return getServerUrl().length > 0
}

export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng')
    )
  }
  return workerPromise
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

async function recognizeLocal(image: string): Promise<string> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(image)
  return data.text.trim()
}

export function stripGroundingMarkers(raw: string): string {
  return raw
    .replace(/<\|ref\|>[^]*?<\|\/ref\|>/g, '')
    .replace(/<\|det\|>[^]*?<\|\/det\|>/g, '')
    .replace(/<PAGE>/g, '\n\n')
    .replace(/[^\S\n]*\[-?\d+, -?\d+, -?\d+, -?\d+\]/g, '')
    .trim()
}

export async function serverRecognize(
  images: string[],
  instruction = ' document parsing.',
  maxTokens = 8192
): Promise<string> {
  const base = getServerUrl()
  const endpoint = base.endsWith('/v1') ? base : `${base}/v1`
  const windowSize = images.length > 1 ? 1024 : 128
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SERVER_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image_url',
              image_url: { url: img },
            })),
            { type: 'text', text: instruction },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      skip_special_tokens: false,
      ngram_size: 35,
      window_size: windowSize,
      custom_params: {
        ngram_size: 35,
        window_size: windowSize,
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`OCR server error (HTTP ${res.status})`)
  }
  const data = await res.json()
  const out: unknown = data?.choices?.[0]?.message?.content
  if (typeof out !== 'string' || out.length === 0) {
    throw new Error('OCR server returned no text')
  }
  return out.trim()
}

export async function extractTextFromImage(
  image: string | File
): Promise<OcrResult> {
  const dataUrl = typeof image === 'string' ? image : await toDataUrl(image)
  if (serverConfigured()) {
    try {
      const raw = await serverRecognize([dataUrl])
      const text = stripGroundingMarkers(raw)
      return { text, engine: 'server', pages: 1 }
    } catch (err) {
      const message = (err as Error).message
      const text = await recognizeLocal(dataUrl)
      return { text, engine: 'on-device', pages: 1, serverError: message }
    }
  }
  const text = await recognizeLocal(dataUrl)
  return { text, engine: 'on-device', pages: 1 }
}

export async function extractTextFromPdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<OcrResult> {
  const pdfjsLib = await loadPdfJs()
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() })
    .promise
  const total = doc.numPages
  const pages: string[] = []
  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total)
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    pages.push(canvas.toDataURL('image/jpeg', 0.9))
  }

  const renderLocal = async (): Promise<string> => {
    let text = ''
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i + 1, total)
      text += `--- PAGE ${i + 1} ---\n${await recognizeLocal(pages[i])}\n\n`
    }
    return text.trim()
  }

  if (serverConfigured()) {
    try {
      const raw = await serverRecognize(pages)
      let text = stripGroundingMarkers(raw)
      text = text.replace(/--- PAGE (\d+) ---/g, '')
      return { text, engine: 'server', pages: total }
    } catch (err) {
      const message = (err as Error).message
      const text = await renderLocal()
      return { text, engine: 'on-device', pages: total, serverError: message }
    }
  }

  const text = await renderLocal()
  return { text, engine: 'on-device', pages: total }
}

export async function getPdfFirstPage(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJs()
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.85)
}
