import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import CompareSlider from '../CompareSlider'
import type { FormAnalysis } from '../../lib/formFill'

interface FillResultDialogProps {
  analysis: FormAnalysis | null
  originalSrc: string
  filledImage: string
  fillSkipped: string[]
  filledSaved: boolean
  fillBusy: boolean
  onClose: () => void
  onShare: () => void
  onDownload: () => void
  onSaveToHistory: () => void
  onInspect?: () => void
}

export default function FillResultDialog({
  analysis,
  originalSrc,
  filledImage,
  fillSkipped,
  filledSaved,
  fillBusy,
  onClose,
  onShare,
  onDownload,
  onSaveToHistory,
  onInspect,
}: FillResultDialogProps) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="wm-dialog">
        <DialogHeader className="text-left">
          <DialogTitle>Filled form</DialogTitle>
          <p className="engine-badge">Drag the divider to compare</p>
          <div className="badge-row">
            {analysis?.matchSource === 'llm' ? (
              <span className="status-badge llm">Values: AI matching</span>
            ) : (
              <span className="status-badge warn">Values: keyword matching</span>
            )}
          </div>
        </DialogHeader>

        <div className="compare-wrap">
          <CompareSlider beforeSrc={originalSrc} afterSrc={filledImage} />
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

        {fillSkipped.length > 0 && (
          <p className="fill-skip-note">
            Skipped {fillSkipped.length} field{fillSkipped.length === 1 ? '' : 's'} (no clean
            blank space to write in): {fillSkipped.join(', ')}
          </p>
        )}

        <div className="wm-dialog-actions">
          <Button variant="secondary" onClick={onClose}>Done</Button>
          <Button variant="secondary" onClick={onShare}>Share</Button>
          <Button variant="secondary" onClick={onDownload}>Download</Button>
          <Button onClick={onSaveToHistory} disabled={filledSaved || fillBusy}>
            {filledSaved ? 'Saved ✓' : 'Save to history'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
