import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    target: 'es2022',
    // Don't speculatively <link modulepreload> lazy chunks — a logged-out
    // visitor would otherwise download the app shell it never runs.
    // Automatic code-splitting handles the rest: route chunks (App lazy),
    // and pdfjs / tesseract / opencv (dynamic import()) all land in
    // separate on-demand chunks.
    modulePreload: false,
  },
})
