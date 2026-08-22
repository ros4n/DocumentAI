import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import CompareSlider from '../CompareSlider'
import ScanBadge from '../ScanBadge'
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
        <div className="detail-title-block">
          <Input
            className="detail-name-input w-full border-transparent bg-transparent px-0 text-lg font-semibold"
            value={nameDraft}
            onChange={(e) => onNameDraft(e.target.value)}
            onBlur={() => {
              const trimmed = nameDraft.trim()
              if (trimmed && trimmed !== scan.name) {
                onRename(scan.id, trimmed)
              } else if (!trimmed) {
                onNameDraft(scan.name)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            aria-label="Scan name"
          />
          <div className="badge-row">
            <ScanBadge scan={scan} />
            <span className="status-badge ok">
              {scan.scan_type === 'pdf' ? 'PDF' : 'Image'} · {scan.source}
            </span>
          </div>
        </div>

        <p className="detail-date">
          {fmtDate(scan.created_at)} · {fmtTime(scan.created_at)}
          {scan.pages > 1 ? ` · ${scan.pages} pages` : ''}
        </p>

        {scan.filled_image ? (
          <div className="compare-wrap">
            <CompareSlider beforeSrc={scan.preview_image} afterSrc={scan.filled_image} />
            {onInspect && (
              <button className="inspect-btn" onClick={onInspect} aria-label="Open side-by-side fullscreen view" title="Fullscreen compare">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                Inspect
              </button>
            )}
          </div>
        ) : (
          <div className="fill-compare">
            <div className="fill-col">
              <span>Original (unfilled)</span>
              <img className="detail-preview" src={scan.preview_image} alt="Original scan" />
            </div>
            <div className="fill-col">
              <span>Filled</span>
              <div className="detail-no-filled">
                <p>No filled version yet.</p>
                <p>Scan again and tap “Fill form”, then “Save to history”.</p>
              </div>
            </div>
          </div>
        )}

        {scan.ocr_text && <pre className="ocr-text detail-text">{scan.ocr_text}</pre>}

        <div className="wm-dialog-actions">
          <Button variant="destructive" onClick={() => onDelete(scan.id)}>
            Delete
          </Button>
          <Button
            variant="secondary"
            onClick={() => onDownloadImage(scan.preview_image, `snappy-scan-${scan.id}.jpg`)}
          >
            Download original
          </Button>
          {scan.filled_image && (
            <Button
              onClick={() => onDownloadImage(scan.filled_image, `snappy-filled-${scan.id}.jpg`)}
            >
              Download filled
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
