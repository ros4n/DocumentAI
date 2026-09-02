import { toast } from 'sonner'

import CaptureView from '../../components/CaptureView'
import FieldReviewOverlay from '../../components/FieldReviewOverlay'
import FullscreenImageViewer from '../../components/FullscreenImageViewer'
import CropImage from '../../components/CropImage'
import OcrResultDialog from '../../components/dialogs/OcrResultDialog'
import ReviewFillsDialog from '../../components/dialogs/ReviewFillsDialog'
import FillResultDialog from '../../components/dialogs/FillResultDialog'
import { llmConfigured, getLlmConfig } from '../../lib/llm'
import { getServerUrl } from '../../lib/ocr'
import { useScanSession } from '../../hooks/useScanSession'
import type { ScanRecord } from '../../lib/api'

interface CaptureFlowProps {
  onScanCreated: (record: ScanRecord) => void
  onScanUpdated: (record: ScanRecord) => void
  onNeedProfile: () => void
}

export default function CaptureFlow({
  onScanCreated,
  onScanUpdated,
  onNeedProfile,
}: CaptureFlowProps) {
  const s = useScanSession({ onScanCreated, onScanUpdated, onNeedProfile })
  const { capture, ocr, fill, crop } = s

  const serverUrl = getServerUrl()
  const llm = getLlmConfig()

  const copyText = async () => {
    if (!ocr.ocrResult) return
    try {
      await navigator.clipboard.writeText(ocr.ocrResult.text)
      toast('Text copied')
    } catch {
      toast('Copy not supported on this device')
    }
  }

  const downloadText = () => {
    if (!ocr.ocrResult) return
    const blob = new Blob([ocr.ocrResult.text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snappy-ocr-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    a.click()
  }

  return (
    <>
      <div className="mb-3.5 flex flex-wrap gap-1.5 text-xs">
        <span className={`rounded-full px-2.5 py-1 ${serverUrl ? 'bg-accent-soft text-accent-hover' : 'bg-surface-sunken text-text-muted'}`}>
          {serverUrl ? 'Server OCR' : 'On-device OCR'}
        </span>
        <span className={`rounded-full px-2.5 py-1 ${llmConfigured() ? 'bg-accent-soft text-accent-hover' : 'bg-surface-sunken text-text-muted'}`}>
          {llmConfigured()
            ? `AI: ${llm.url.includes('google') ? 'Gemini' : 'on'}`
            : 'AI off'}
        </span>
      </div>

      <CaptureView
        videoRef={s.refs.videoRef}
        fileInputRef={s.refs.fileInputRef}
        pdfInputRef={s.refs.pdfInputRef}
        streamActive={capture.streamActive}
        cameraError={capture.cameraError}
        captured={capture.preview}
        ocrBusy={ocr.ocrBusy}
        fillBusy={fill.fillBusy}
        fillStatus={fill.fillStatus}
        ocrStatus={ocr.ocrStatus}
        enhancing={capture.enhancing}
        enhanceMeta={capture.enhanceMeta}
        useEnhanced={capture.useEnhanced}
        hasEnhanced={capture.hasEnhanced}
        onToggleEnhanced={capture.toggleEnhanced}
        onStartCamera={capture.startCamera}
        onCapture={capture.takePhoto}
        onRetake={capture.retake}
        onSaveScan={capture.saveScan}
        onShareScan={capture.shareScan}
        onCrop={crop.openCrop}
        onExtractText={ocr.extractFromCapture}
        onStartFill={fill.startFill}
        onImageUpload={capture.handleUpload}
        onPdfUpload={capture.handlePdfUpload}
      />

      {ocr.ocrResult && (
        <OcrResultDialog
          result={ocr.ocrResult}
          onClose={() => ocr.setOcrResult(null)}
          onCopy={copyText}
          onDownload={downloadText}
        />
      )}

      {fill.detection && (
        <FieldReviewOverlay
          imageDataUrl={fill.detection.imageDataUrl}
          detection={fill.detection.detection}
          onConfirm={fill.confirmDetectedFields}
          onCancel={fill.dismissDetection}
        />
      )}

      {fill.analysis && !fill.resultOpen && (
        <ReviewFillsDialog
          analysis={fill.analysis}
          edits={fill.edits}
          onUpdateEdit={fill.updateEdit}
          onSelectGroupOption={fill.selectGroupOption}
          onToggleGroup={fill.toggleGroup}
          onCancel={fill.closeFillFlow}
          onApply={fill.applyFill}
        />
      )}

      {fill.resultOpen && fill.filledImage && (
        <FillResultDialog
          analysis={fill.analysis}
          originalSrc={fill.renderImage ?? capture.captured ?? ''}
          filledImage={fill.filledImage}
          fillSkipped={fill.fillSkipped}
          filledSaved={fill.filledSaved}
          fillBusy={fill.fillBusy}
          onClose={fill.closeFillFlow}
          onShare={async () => {
            if (!fill.filledImage) return
            const blob = await (await fetch(fill.filledImage)).blob()
            const file = new File([blob], 'filled-form.jpg', { type: 'image/jpeg' })
            if (navigator.share) {
              try {
                await navigator.share({ files: [file], title: 'Snappy filled form' })
              } catch {
                /* user cancelled */
              }
            } else {
              try {
                await navigator.clipboard.writeText(fill.filledImage)
                toast('Image copied to clipboard')
              } catch {
                toast('Sharing not supported on this device')
              }
            }
          }}
          onDownload={() => {
            if (!fill.filledImage) return
            downloadImage(fill.filledImage, `snappy-filled-${Date.now()}.jpg`)
            toast('Filled form saved')
          }}
          onSaveToHistory={fill.saveFilledToHistory}
          onInspect={
            (fill.renderImage ?? capture.captured) && fill.filledImage
              ? () =>
                  s.openFullscreenImage({
                    originalSrc: (fill.renderImage ?? capture.captured)!,
                    originalAlt: 'Original form',
                    filledSrc: fill.filledImage!,
                    filledAlt: 'Filled form',
                    title: 'Form preview',
                    subtitle: 'Inspect the original and filled versions side by side',
                  })
              : undefined
          }
        />
      )}

      {crop.cropOpen && capture.captured && (
        <CropImage
          src={capture.captured}
          onCancel={crop.closeCrop}
          onCrop={(cropped) => {
            capture.setCaptured(cropped)
            crop.closeCrop()
            toast('Scan cropped')
          }}
        />
      )}

      {s.fullscreenImage && (
        <FullscreenImageViewer
          open={!!s.fullscreenImage}
          onClose={s.closeFullscreenImage}
          originalSrc={s.fullscreenImage.originalSrc}
          originalAlt={s.fullscreenImage.originalAlt}
          filledSrc={s.fullscreenImage.filledSrc}
          filledAlt={s.fullscreenImage.filledAlt}
          title={s.fullscreenImage.title}
          subtitle={s.fullscreenImage.subtitle}
        />
      )}
    </>
  )
}
