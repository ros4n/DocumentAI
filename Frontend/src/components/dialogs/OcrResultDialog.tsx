import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import type { OcrResult } from '../../lib/ocr'

interface OcrResultDialogProps {
  result: OcrResult
  onClose: () => void
  onCopy: () => void
  onDownload: () => void
}

export default function OcrResultDialog({ result, onClose, onCopy, onDownload }: OcrResultDialogProps) {
  const engineBadge = (() => {
    if (result.engine === 'backend') {
      return (
        <span className="status-badge ok">
          OCR: Snappy API{result.pages > 1 ? ` · ${result.pages} pages` : ''}
        </span>
      )
    }
    if (result.engine === 'server') {
      return (
        <span className="status-badge ok">
          OCR: OCR server{result.pages > 1 ? ` · ${result.pages} pages` : ''}
        </span>
      )
    }
    if (result.serverError) {
      return <span className="status-badge warn">OCR: remote OCR failed — on-device fallback</span>
    }
    return (
      <span className="status-badge">
        OCR: on-device (Tesseract){result.pages > 1 ? ` · ${result.pages} pages` : ''}
      </span>
    )
  })()

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="wm-dialog">
        <DialogHeader className="text-left">
          <DialogTitle>Extracted text</DialogTitle>
          {engineBadge}
        </DialogHeader>
        <pre className="ocr-text">{result.text || 'No text found'}</pre>
        <div className="wm-dialog-actions">
          <Button variant="secondary" onClick={onCopy}>Copy</Button>
          <Button onClick={onDownload}>Download .txt</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
