import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (was a render-blocking Google Fonts <link>).
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource-variable/ibm-plex-sans/wght.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/tokens.css'
import './tailwind.css'
import './styles/base.css'
import App from './App'
import { applyStoredTheme } from './lib/theme'

applyStoredTheme()

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* service worker unavailable */
    })
  })
}
