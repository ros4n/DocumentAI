const CACHE_NAME = 'snappy-v3'
const RUNTIME_CACHE = 'snappy-runtime-v3'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
]

// Heavy on-device engines live on third-party CDNs (OpenCV.js WASM,
// Tesseract.js worker + core + language data). Cache them so the
// multi-megabyte download happens once per device, not per session.
const ENGINE_HOSTS = [
  'docs.opencv.org',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'tessdata.projectnaptha.com',
  'tesseract.projectnaptha.com'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Cache-first for engine assets on third-party CDNs
  if (ENGINE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached
          return fetch(request).then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              cache.put(request, response.clone())
            }
            return response
          })
        })
      )
    )
    return
  }

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    })
  )
})
