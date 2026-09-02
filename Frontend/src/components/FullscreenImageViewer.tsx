import { X as XIcon } from '@phosphor-icons/react'

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
  subtitle = 'Scroll to zoom, drag to pan, double-click to reset',
}: FullscreenImageViewerProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(94dvh,960px)] w-[min(96vw,1440px)] max-w-none flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-surface-page p-[18px]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold leading-tight">{title}</h2>
            <p className="mt-1 text-[13px] text-text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen viewer"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2 text-text shadow-sm"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3.5">
          <section className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Original</span>
            <ZoomableImage src={originalSrc} alt={originalAlt} className="h-auto min-h-0 flex-1 rounded-2xl" />
          </section>
          <section className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Filled</span>
            <ZoomableImage src={filledSrc} alt={filledAlt} className="h-auto min-h-0 flex-1 rounded-2xl" />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
