import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { StatusPill, DialogActions } from './_shared'
import type { OcrResult } from '../../lib/ocr'

interface OcrResultDialogProps {
  result: OcrResult
  onClose: () => void
  onCopy: () => void
  onDownload: () => void
}

export default function OcrResultDialog({ result, onClose, onCopy, onDownload }: OcrResultDialogProps) {
  const pages = result.pages > 1 ? ` · ${result.pages} pages` : ''
  const badge =
    result.engine === 'backend' ? (
      <StatusPill tone="ok">Snappy API{pages}</StatusPill>
    ) : result.engine === 'server' ? (
      <StatusPill tone="ok">OCR server{pages}</StatusPill>
    ) : result.serverError ? (
      <StatusPill tone="warn">Remote OCR failed, used on-device</StatusPill>
    ) : (
      <StatusPill>On-device (Tesseract){pages}</StatusPill>
    )

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="wm-dialog">
        <DialogHeader className="text-left">
          <DialogTitle>Extracted text</DialogTitle>
          <div className="pt-1">{badge}</div>
        </DialogHeader>
        <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-sunken p-3 font-mono text-[13px] leading-relaxed text-text">
          {result.text || 'No text found'}
        </pre>
        <DialogActions>
          <Button variant="secondary" onClick={onCopy}>Copy</Button>
          <Button onClick={onDownload}>Download .txt</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
