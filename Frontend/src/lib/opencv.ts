/* ============================================================
   Shared OpenCV.js runtime loader.

   opencv.js is lazy-loaded once per device and reused by both the
   Tier-2 field detector and the scan pre-processor. Sources are tried
   in order:
     1. Same-origin /vendor/opencv.js  (self-hosted, no CORS)
     2. jsDelivr edge CDN
     3. docs.opencv.org (official host)
   The service worker caches whichever wins.
   ============================================================ */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Cv = any
export type CvStage = (message: string) => void

const OPENCV_SOURCES = [
  '/vendor/opencv.js',
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@5.0.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.9.0/opencv.js',
]

const INIT_TIMEOUT_MS = 45_000

let cvPromise: Promise<Cv> | null = null
let cvResolved: Cv | null = null

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.opencv = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('OpenCV.js failed to execute'))
    document.head.appendChild(script)
  })
}

async function attemptSource(src: string, w: any, onStage?: CvStage): Promise<Cv> {
  onStage?.('Downloading on-device engine…')

  // Warm the HTTP cache with live progress; the <script> tag below re-requests
  // the same URL and is served from cache. Injecting the original src keeps
  // Emscripten resource resolution intact (blob URLs break some builds).
  try {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('Content-Length') ?? 0)
    if (res.body) {
      const reader = res.body.getReader()
      let received = 0
      let lastMsg = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        const msg =
          total > 0
            ? `Downloading on-device engine · ${Math.min(99, Math.floor((received / total) * 100))}%`
            : `Downloading on-device engine · ${(received / 1048576).toFixed(1)} MB`
        if (msg !== lastMsg) {
          lastMsg = msg
          onStage?.(msg)
        }
      }
    }
  } catch {
    /* warming is best-effort */
  }

  onStage?.('Starting vision engine…')
  await injectScript(src)

  const deadline = Date.now() + INIT_TIMEOUT_MS
  while (!w.cv) {
    if (Date.now() > deadline) throw new Error('OpenCV.js never attached to window')
    await new Promise((r) => window.setTimeout(r, 50))
  }

  let cv: any = w.cv
  if (cv && typeof cv.then === 'function') {
    cv = await Promise.race([
      cv,
      new Promise<never>((_, reject) =>
        window.setTimeout(
          () => reject(new Error('OpenCV.js WASM initialization timed out')),
          Math.max(1000, deadline - Date.now())
        )
      ),
    ])
  }

  while (!(cv && typeof cv.Mat === 'function')) {
    if (Date.now() > deadline) throw new Error('OpenCV.js loaded but its API never initialized')
    await new Promise((r) => window.setTimeout(r, 80))
  }

  return cv as Cv
}

export async function loadCv(onStage?: CvStage): Promise<Cv> {
  if (cvResolved) return cvResolved
  if (!cvPromise) {
    cvPromise = (async () => {
      const w = window as any
      if (w.cv && typeof w.cv.Mat === 'function') {
        cvResolved = w.cv as Cv
        return cvResolved
      }
      for (const src of OPENCV_SOURCES) {
        try {
          const cv = await attemptSource(src, w, onStage)
          cvResolved = cv
          return cvResolved
        } catch (err) {
          console.warn(`OpenCV source failed (${src})`, err)
        }
      }
      throw new Error(
        'Could not load the on-device vision engine. Check your connection and try again.'
      )
    })()
    cvPromise.catch(() => {
      cvPromise = null
    })
  }
  return cvPromise
}

/** True once opencv.js has been successfully loaded this session. */
export function cvReady(): boolean {
  return cvResolved != null
}

/**
 * Decode a data URL into an RGBA cv.Mat (white backdrop so transparent PNGs
 * don't turn black on GRAY conversion). `maxSide` downscales large inputs.
 */
export async function imageToMat(
  cv: Cv,
  dataUrl: string,
  maxSide = Infinity
): Promise<{ mat: any; width: number; height: number }> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not decode the page image'))
    img.src = dataUrl
  })
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  return { mat: cv.matFromImageData(imageData), width, height }
}
