import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import CompareSlider from '../CompareSlider'
import ScanBadge from '../ScanBadge'
import { StatusPill, DialogActions } from './_shared'
import { ArrowsOutSimple } from '../icons'
import { fmtDate, fmtTime } from '../../lib/scanFormat'
import type { ScanRecord } from '../../lib/api'

interface ScanDetailDialogProps {
  scan: ScanRecord
  nameDraft: string
  onNameDraft: (v: string) => void
  onRename: (id: number, name: string) => void
  onDelete: (id: number) => void
  onDownloadImage: (dataUrl: string, name: string) => void
  onClose: () => void
  onInspect?: () => void
}

export default function ScanDetailDialog({
  scan,
  nameDraft,
  onNameDraft,
  onRename,
  onDelete,
  onDownloadImage,
  onClose,
  onInspect,
}: ScanDetailDialogProps) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="wm-dialog">
        <DialogTitle className="sr-only">Scan details</DialogTitle>

        <input
          className="w-full rounded-lg bg-transparent px-0 font-display text-lg font-semibold text-text outline-none focus:bg-surface-sunken focus:px-2"
          value={nameDraft}
          onChange={(e) => onNameDraft(e.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim()
            if (trimmed && trimmed !== scan.name) onRename(scan.id, trimmed)
            else if (!trimmed) onNameDraft(scan.name)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label="Scan name"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <ScanBadge scan={scan} />
          <StatusPill>
            {scan.scan_type === 'pdf' ? 'PDF' : 'Image'} · {scan.source}
          </StatusPill>
          <span className="text-xs text-text-muted">
            {fmtDate(scan.created_at)} · {fmtTime(scan.created_at)}
            {scan.pages > 1 ? ` · ${scan.pages} pages` : ''}
          </span>
        </div>

        {scan.filled_image ? (
          <div className="relative">
            <CompareSlider beforeSrc={scan.preview_image} afterSrc={scan.filled_image} />
            {onInspect && (
              <button
                onClick={onInspect}
                aria-label="Open side-by-side fullscreen view"
                title="Fullscreen compare"
                className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-surface-raised/90 px-2 py-1 text-xs font-medium text-text shadow-sm backdrop-blur"
              >
                <ArrowsOutSimple size={14} />
                Inspect
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">Original</span>
              <img
                className="w-full rounded-lg border border-border"
                src={scan.preview_image}
                alt="Original scan"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">Filled</span>
              <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-border-strong p-4 text-center text-xs text-text-muted">
                No filled version yet. Scan again, tap Fill form, then Save to history.
              </div>
            </div>
          </div>
        )}

        {scan.ocr_text && (
          <pre className="max-h-[30vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-sunken p-3 font-mono text-[13px] leading-relaxed text-text">
            {scan.ocr_text}
          </pre>
        )}

        <DialogActions>
          <Button variant="destructive" onClick={() => onDelete(scan.id)}>Delete</Button>
          <Button
            variant="secondary"
            onClick={() => onDownloadImage(scan.preview_image, `snappy-scan-${scan.id}.jpg`)}
          >
            Download original
          </Button>
          {scan.filled_image && (
            <Button onClick={() => onDownloadImage(scan.filled_image, `snappy-filled-${scan.id}.jpg`)}>
              Download filled
            </Button>
          )}
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
