import { useState } from 'react'
import type { ChangeEvent, ReactNode, RefObject } from 'react'
import { motion } from 'framer-motion'
import { Button } from './ui/button'
import ProcessingCard from './ProcessingCard'
import { EASE_OUT_SOFT } from '../lib/motion'
import {
  Camera,
  Image,
  FilePdf,
  TextAa,
  PencilSimple,
  ArrowCounterClockwise,
  Crop,
  DownloadSimple,
  ShareNetwork,
  SpinnerGap,
  Sparkle,
  Warning,
} from './icons'
import type { PreprocessMeta } from '../lib/preprocess'

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
  enhancing: boolean
  enhanceMeta: PreprocessMeta | null
  useEnhanced: boolean
  hasEnhanced: boolean
  onToggleEnhanced: () => void
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

const SOURCE_MODES: Array<{ key: SourceMode; label: string; icon: ReactNode }> = [
  { key: 'camera', label: 'Camera', icon: <Camera size={15} /> },
  { key: 'image', label: 'Image', icon: <Image size={15} /> },
  { key: 'pdf', label: 'PDF', icon: <FilePdf size={15} /> },
]

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface-raised py-2.5 text-[11px] font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text active:scale-[0.97]"
    >
      {icon}
      {label}
    </button>
  )
}

function enhanceSummary(m: PreprocessMeta): string {
  if (m.engine === 'none') return 'Using the original scan'
  const bits: string[] = []
  if (m.documentDetected) bits.push('straightened')
  else if (Math.abs(m.rotatedDeg) >= 0.5) bits.push(`deskewed ${Math.abs(m.rotatedDeg).toFixed(1)}°`)
  bits.push('contrast boosted')
  return `Cleaned up · ${bits.join(' · ')}`
}

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
  enhancing,
  enhanceMeta,
  useEnhanced,
  hasEnhanced,
  onToggleEnhanced,
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
    <div className="flex flex-col gap-4">
      {captured ? (
        <motion.div
          className="flex flex-col gap-3"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32, ease: EASE_OUT_SOFT }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-sunken">
            <img key={captured} className="block w-full" src={captured ?? ''} alt="Captured scan" />
            {enhancing && !busy && (
              <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-surface-raised/90 px-2.5 py-1 text-xs font-medium text-text-muted shadow-sm backdrop-blur">
                <SpinnerGap size={13} className="animate-spin" />
                Cleaning up…
              </span>
            )}
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-surface-page/80 p-5 backdrop-blur-sm">
                <ProcessingCard
                  title={fillBusy ? 'Filling your form' : 'Extracting text'}
                  steps={
                    fillBusy
                      ? ['Detecting fields', 'Matching profile values', 'Rendering filled copy']
                      : ['Preparing document', 'Reading text (OCR)']
                  }
                  forceStep={
                    fillBusy
                      ? fillStatus.startsWith('Rendering')
                        ? 2
                        : fillStatus.startsWith('Matching')
                          ? 1
                          : 0
                      : undefined
                  }
                  note={fillBusy ? fillStatus : ocrStatus || undefined}
                />
              </div>
            )}
          </div>

          {!busy && (
            <>
              {hasEnhanced && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                    <Sparkle size={13} weight="fill" className="shrink-0 text-accent" />
                    <span className="truncate">
                      {enhanceMeta ? enhanceSummary(enhanceMeta) : 'Scan cleaned up'}
                    </span>
                  </span>
                  <div className="flex shrink-0 rounded-full bg-surface-sunken p-0.5 text-[11px] font-medium">
                    <button
                      onClick={() => useEnhanced || onToggleEnhanced()}
                      className={`rounded-full px-2 py-0.5 ${useEnhanced ? 'bg-surface-raised text-text shadow-sm' : 'text-text-muted'}`}
                    >
                      Enhanced
                    </button>
                    <button
                      onClick={() => useEnhanced && onToggleEnhanced()}
                      className={`rounded-full px-2 py-0.5 ${!useEnhanced ? 'bg-surface-raised text-text shadow-sm' : 'text-text-muted'}`}
                    >
                      Original
                    </button>
                  </div>
                </div>
              )}

              {enhanceMeta?.blurry && (
                <p className="flex items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-2.5 py-2 text-xs text-warning">
                  <Warning size={13} weight="fill" className="shrink-0" />
                  This scan looks blurry. A steadier retake will read more accurately.
                </p>
              )}

              <div className="grid grid-cols-4 gap-2">
                <QuickAction icon={<ArrowCounterClockwise size={18} />} label="Retake" onClick={onRetake} />
                <QuickAction icon={<Crop size={18} />} label="Crop" onClick={onCrop} />
                <QuickAction icon={<DownloadSimple size={18} />} label="Save" onClick={onSaveScan} />
                <QuickAction icon={<ShareNetwork size={18} />} label="Share" onClick={onShareScan} />
              </div>

              <Button variant="outline" className="w-full" onClick={onExtractText} disabled={busy}>
                <TextAa size={16} />
                Extract text
              </Button>
              <Button className="w-full" onClick={onStartFill} disabled={busy}>
                <PencilSimple size={16} />
                Fill form
              </Button>
            </>
          )}
        </motion.div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Scan source"
            className="relative flex rounded-full bg-surface-sunken p-1"
          >
            {SOURCE_MODES.map(({ key, label, icon }) => {
              const active = mode === key
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(key)}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition-colors ${
                    active ? 'text-text' : 'text-text-muted'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="seg-thumb"
                      className="absolute inset-0 rounded-full bg-surface-raised shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 42 }}
                    />
                  )}
                  <span className="relative">{icon}</span>
                  <span className="relative">{label}</span>
                </button>
              )
            })}
          </div>

          {mode === 'camera' ? (
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-surface-sunken">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              {flash && <div className="absolute inset-0 bg-white/80" />}
              {!streamActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 p-6 text-center text-sm text-text-muted">
                  <div className="grid size-[88px] place-items-center rounded-full border border-border-strong bg-surface-raised text-accent">
                    <Camera size={42} weight="light" />
                  </div>
                  <p>Camera is off</p>
                  {cameraError && <p className="text-[13px] text-danger">{cameraError}</p>}
                </div>
              )}
              {streamActive && (
                <div className="pointer-events-none absolute inset-0">
                  <span className="absolute left-[18px] top-[18px] size-8 rounded-tl-[10px] border-l-[3px] border-t-[3px] border-white/90" />
                  <span className="absolute right-[18px] top-[18px] size-8 rounded-tr-[10px] border-r-[3px] border-t-[3px] border-white/90" />
                  <span className="absolute bottom-[18px] left-[18px] size-8 rounded-bl-[10px] border-b-[3px] border-l-[3px] border-white/90" />
                  <span className="absolute bottom-[18px] right-[18px] size-8 rounded-br-[10px] border-b-[3px] border-r-[3px] border-white/90" />
                  <span className="absolute inset-x-0 bottom-4 text-center text-xs font-medium text-white/90 drop-shadow">
                    Align document within frame
                  </span>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => (mode === 'image' ? fileInputRef : pdfInputRef).current?.click()}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-surface-sunken px-6 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
            >
              <span className="grid size-16 place-items-center rounded-full bg-surface-raised text-accent">
                {mode === 'image' ? <Image size={26} weight="light" /> : <FilePdf size={26} weight="light" />}
              </span>
              <span className="font-display text-[15px] font-semibold text-text">
                {mode === 'image' ? 'Choose an image' : 'Choose a PDF'}
              </span>
              <span className="max-w-[220px] text-xs text-text-muted">
                {mode === 'image'
                  ? 'JPG or PNG. Photos of paper forms work great.'
                  : 'Multi-page supported, up to 15 pages.'}
              </span>
            </button>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
          <input ref={pdfInputRef} type="file" accept="application/pdf" onChange={onPdfUpload} className="hidden" />

          <div className="flex items-center justify-center">
            {mode === 'camera' ? (
              streamActive ? (
                <button
                  onClick={handleCapture}
                  disabled={busy}
                  aria-label="Capture"
                  className="grid size-16 place-items-center rounded-full border-4 border-accent transition-transform active:scale-95 disabled:opacity-50"
                >
                  <span className="size-11 rounded-full bg-accent" />
                </button>
              ) : (
                <Button size="lg" onClick={onStartCamera}>Enable camera</Button>
              )
            ) : (
              <p className="text-[13px] text-text-muted">
                {mode === 'image' ? 'Pick a photo to scan' : 'Pick a PDF to scan'}
              </p>
            )}
          </div>

          <p className="text-center text-[13px] text-text-muted">
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
