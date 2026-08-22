import { useState } from 'react'
import type { ChangeEvent, RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from './ui/button'
import ProcessingCard from './ProcessingCard'
import { EASE_OUT_SOFT } from '../lib/motion'

interface CaptureViewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  pdfInputRef: RefObject<HTMLInputElement | null>
  streamActive: boolean
  cameraError: string
  captured: string | null
  ocrBusy: boolean
  fillBusy: boolean
  fillStatus: string
  ocrStatus: string
  onStartCamera: () => void
  onCapture: () => void
  onRetake: () => void
  onSaveScan: () => void
  onShareScan: () => void
  onCrop: () => void
  onExtractText: () => void
  onStartFill: () => void
  onImageUpload: (e: ChangeEvent<HTMLInputElement>) => void
  onPdfUpload: (e: ChangeEvent<HTMLInputElement>) => void
}

type SourceMode = 'camera' | 'image' | 'pdf'

const SOURCE_MODES: Array<{ key: SourceMode; label: string; icon: React.ReactNode }> = [
  {
    key: 'camera',
    label: 'Camera',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    key: 'image',
    label: 'Image',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
      </svg>
    ),
  },
  {
    key: 'pdf',
    label: 'PDF',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
]

export default function CaptureView({
  videoRef,
  fileInputRef,
  pdfInputRef,
  streamActive,
  cameraError,
  captured,
  ocrBusy,
  fillBusy,
  fillStatus,
  ocrStatus,
  onStartCamera,
  onCapture,
  onRetake,
  onSaveScan,
  onShareScan,
  onCrop,
  onExtractText,
  onStartFill,
  onImageUpload,
  onPdfUpload,
}: CaptureViewProps) {
  const [mode, setMode] = useState<SourceMode>('camera')
  const [flash, setFlash] = useState(false)
  const busy = ocrBusy || fillBusy

  const handleCapture = () => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 340)
    onCapture()
  }

  return (
    <div className="scanner-card">
      {captured ? (
        <motion.div
          className="scan-result"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32, ease: EASE_OUT_SOFT }}
        >
          <div className="captured-wrap">
            <img key={captured} className="captured-thumb-enter" src={captured} alt="Captured scan" />
            <AnimatePresence>
              {busy && (
                <div className="capture-overlay">
                  <ProcessingCard
                    title={fillBusy ? 'Filling your form' : 'Extracting text'}
                    steps={
                      fillBusy
                        ? ['Analyzing form', 'Matching profile values', 'Rendering filled copy']
                        : ['Preparing document', 'Reading text (OCR)']
                    }
                    forceStep={fillBusy ? (fillStatus.startsWith('Analyzing') ? 0 : 2) : undefined}
                    note={fillBusy ? fillStatus : ocrStatus || undefined}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {!busy && (
            <>
              <div className="scan-actions">
                <Button variant="secondary" onClick={onRetake}>Retake</Button>
                <Button variant="secondary" onClick={onCrop} aria-label="Crop scan">Crop</Button>
                <Button variant="secondary" onClick={onExtractText}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                  Text
                </Button>
                <Button onClick={onSaveScan}>Save</Button>
                <Button onClick={onShareScan}>Share</Button>
              </div>

              <Button variant="secondary" className="btn-fill w-full" onClick={onStartFill} disabled={busy}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Fill form
              </Button>
            </>
          )}
        </motion.div>
      ) : (
        <>
          <div className="seg-picker" role="tablist" aria-label="Scan source">
            {SOURCE_MODES.map(({ key, label, icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                className={`seg-btn ${mode === key ? 'active' : ''}`}
                onClick={() => setMode(key)}
              >
                {mode === key && (
                  <motion.span
                    layoutId="seg-thumb"
                    className="seg-thumb"
                    transition={{ type: 'spring', stiffness: 500, damping: 42 }}
                  />
                )}
                <span className="seg-icon">{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {mode === 'camera' ? (
            <div className={`camera-view ${streamActive ? 'active' : ''}`}>
              <video ref={videoRef} autoPlay playsInline muted />
              {flash && <div className="shutter-flash" />}
              {!streamActive && (
                <div className="camera-idle">
                  <div className="idle-camera-icon">
                    <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <p>Camera is off</p>
                  {cameraError && <p className="camera-error">{cameraError}</p>}
                </div>
              )}
              {streamActive && (
                <div className="viewfinder">
                  <div className="framing-thirds">
                    <span className="thirds-v" style={{ left: '33.33%' }} />
                    <span className="thirds-v" style={{ right: '33.33%' }} />
                  </div>
                  <span className="corner tl" />
                  <span className="corner tr" />
                  <span className="corner bl" />
                  <span className="corner br" />
                  <span className="doc-hint">Align document within frame</span>
                  <span className="scan-line" />
                </div>
              )}
            </div>
          ) : (
            <button
              className="upload-slot"
              onClick={() =>
                (mode === 'image' ? fileInputRef : pdfInputRef).current?.click()
              }
            >
              <span className="upload-slot-icon">
                {mode === 'image' ? (
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                )}
              </span>
              <span className="upload-slot-title">
                {mode === 'image' ? 'Choose an image' : 'Choose a PDF'}
              </span>
              <span className="upload-slot-sub">
                {mode === 'image'
                  ? 'JPG or PNG — photos of paper forms work great'
                  : 'Multi-page supported · up to 15 pages'}
              </span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onImageUpload}
            style={{ display: 'none' }}
          />
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            onChange={onPdfUpload}
            style={{ display: 'none' }}
          />

          <div className="scanner-controls">
            {mode === 'camera' ? (
              streamActive ? (
                <button className="shutter" onClick={handleCapture} disabled={busy} aria-label="Capture">
                  <span />
                </button>
              ) : (
                <Button size="lg" onClick={onStartCamera}>Enable camera</Button>
              )
            ) : (
              <p className="scanner-hint">
                {mode === 'image' ? 'Pick a photo to scan' : 'Pick a PDF to scan'}
              </p>
            )}
          </div>

          <p className="scanner-hint">
            {mode === 'camera'
              ? streamActive
                ? 'Line up the document and tap the shutter'
                : 'Grant camera access to scan a document'
              : 'Text is extracted automatically after picking'}
          </p>
        </>
      )}
    </div>
  )
}
