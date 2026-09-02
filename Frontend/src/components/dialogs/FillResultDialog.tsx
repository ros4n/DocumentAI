import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import CompareSlider from '../CompareSlider'
import { StatusPill, DialogActions } from './_shared'
import { ArrowsOutSimple } from '../icons'
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
          <p className="text-xs text-text-muted">Drag the divider to compare.</p>
          <div className="pt-1">
            {analysis?.matchSource === 'llm' ? (
              <StatusPill tone="ai">Values: AI matching</StatusPill>
            ) : (
              <StatusPill tone="warn">Values: keyword matching</StatusPill>
            )}
          </div>
        </DialogHeader>

        <div className="relative">
          <CompareSlider beforeSrc={originalSrc} afterSrc={filledImage} />
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

        {fillSkipped.length > 0 && (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-text-muted">
            Skipped {fillSkipped.length} field{fillSkipped.length === 1 ? '' : 's'} with no clean blank
            space: {fillSkipped.join(', ')}
          </p>
        )}

        <DialogActions>
          <Button variant="secondary" onClick={onClose}>Done</Button>
          <Button variant="secondary" onClick={onShare}>Share</Button>
          <Button variant="secondary" onClick={onDownload}>Download</Button>
          <Button onClick={onSaveToHistory} disabled={filledSaved || fillBusy}>
            {filledSaved ? 'Saved' : 'Save to history'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
