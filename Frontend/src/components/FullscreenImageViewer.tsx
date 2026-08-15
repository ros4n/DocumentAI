import { XIcon } from 'lucide-react'

import { ZoomableImage } from './ZoomableImage'
import { Dialog, DialogContent } from './ui/dialog'

interface FullscreenImageViewerProps {
  open: boolean
  onClose: () => void
  originalSrc: string
  originalAlt: string
  filledSrc: string
  filledAlt: string
  title?: string
  subtitle?: string
}

export default function FullscreenImageViewer({
  open,
  onClose,
  originalSrc,
  originalAlt,
  filledSrc,
  filledAlt,
  title = 'Full-screen comparison',
  subtitle = 'Scroll to zoom, drag to pan, and double-click to reset',
}: FullscreenImageViewerProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="fullscreen-viewer" showCloseButton={false}>
        <div className="fullscreen-viewer-header">
          <div className="fullscreen-viewer-copy">
            <p className="fullscreen-viewer-eyebrow">Compare images</p>
            <h2>{title}</h2>
            <p className="fullscreen-viewer-subtitle">{subtitle}</p>
          </div>
          <button
            type="button"
            className="fullscreen-viewer-close"
            onClick={onClose}
            aria-label="Close fullscreen viewer"
          >
            <XIcon />
          </button>
        </div>

        <div className="fullscreen-viewer-grid">
          <section className="fullscreen-viewer-panel">
            <span className="fullscreen-viewer-label">Original</span>
            <ZoomableImage src={originalSrc} alt={originalAlt} className="fullscreen-zoomable" />
          </section>

          <section className="fullscreen-viewer-panel">
            <span className="fullscreen-viewer-label">Filled</span>
            <ZoomableImage src={filledSrc} alt={filledAlt} className="fullscreen-zoomable" />
          </section>
        </div>

        <p className="fullscreen-viewer-hint">Open either image from the compare view to inspect it in full screen.</p>
      </DialogContent>
    </Dialog>
  )
}