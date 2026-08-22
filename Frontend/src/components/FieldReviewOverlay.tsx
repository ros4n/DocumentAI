import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { EASE_OUT_SOFT, staggerChild, staggerParent } from '../lib/motion'
import { FIELD_TYPES } from '../lib/types'
import type { DetectedField, FieldDetectionResult, FieldType } from '../lib/types'

interface FieldReviewOverlayProps {
  imageDataUrl: string
  detection: FieldDetectionResult
  onConfirm: (fields: DetectedField[]) => void
  onCancel: () => void
}

const TYPE_LABELS: Record<FieldType, string> = {
  text_line: 'Text',
  checkbox: 'Checkbox',
  radio: 'Radio',
  signature: 'Signature',
  date: 'Date',
}

function confidenceClass(confidence: number): 'high' | 'mid' | 'low' {
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'mid'
  return 'low'
}

export default function FieldReviewOverlay({
  imageDataUrl,
  detection,
  onConfirm,
  onCancel,
}: FieldReviewOverlayProps) {
  const [fields, setFields] = useState<DetectedField[]>(detection.fields)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId]
  )

  const updateSelected = (patch: Partial<DetectedField>) => {
    if (!selectedId) return
    setFields((prev) =>
      prev.map((f) => (f.id === selectedId ? { ...f, ...patch } : f))
    )
  }

  const removeSelected = () => {
    if (!selectedId) return
    setFields((prev) => prev.filter((f) => f.id !== selectedId))
    setSelectedId(null)
  }

  const pctBox = (f: DetectedField) => ({
    left: `${(f.bbox.x / Math.max(1, detection.pageWidth)) * 100}%`,
    top: `${(f.bbox.y / Math.max(1, detection.pageHeight)) * 100}%`,
    width: `${(f.bbox.width / Math.max(1, detection.pageWidth)) * 100}%`,
    height: `${(f.bbox.height / Math.max(1, detection.pageHeight)) * 100}%`,
  })

  const counts = {
    high: fields.filter((f) => confidenceClass(f.confidence) === 'high').length,
    mid: fields.filter((f) => confidenceClass(f.confidence) === 'mid').length,
    low: fields.filter((f) => confidenceClass(f.confidence) === 'low').length,
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="wm-dialog field-review-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">Review detected fields</DialogTitle>

        <div className="review-head">
          <div>
            <h3 className="review-title">Detected fields</h3>
            <p className="review-sub">
              {counts.high} confident · {counts.mid} unsure · {counts.low} need review
              <span className={`tier-chip tier-${detection.tierUsed}`}>
                {detection.tierUsed === 'acroform'
                  ? 'PDF form layer'
                  : detection.tierUsed === 'vlm'
                    ? 'AI vision'
                    : 'on-device'}
              </span>
            </p>
          </div>
        </div>

        <div className="review-image-wrap">
          <img src={imageDataUrl} alt="Form page" className="review-image" />
          <motion.div
            className="review-boxes"
            variants={staggerParent}
            initial="initial"
            animate="animate"
          >
            {fields.map((f, i) => {
              const cls = confidenceClass(f.confidence)
              return (
                <motion.button
                  key={f.id}
                  type="button"
                  className={`field-box ${cls} ${selectedId === f.id ? 'selected' : ''}`}
                  style={pctBox(f)}
                  onClick={() =>
                    setSelectedId((prev) => (prev === f.id ? null : f.id))
                  }
                  variants={staggerChild}
                  aria-label={`${TYPE_LABELS[f.fieldType]} field ${i + 1}: ${f.label || 'unlabeled'}`}
                >
                  <span className="field-box-num">{i + 1}</span>
                </motion.button>
              )
            })}
          </motion.div>
          {(detection.warnings?.length ?? 0) > 0 && (
            <div className="review-warnings">
              {detection.warnings!.slice(0, 2).map((w) => (
                <span key={w} className="review-warning">{w}</span>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key="editor"
              className="field-editor"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: EASE_OUT_SOFT }}
            >
              <div className="field-editor-row">
                <Input
                  className="field-editor-label"
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  placeholder="What should this field be called?"
                  aria-label="Field label"
                />
                <select
                  className="review-select"
                  value={selected.fieldType}
                  onChange={(e) => updateSelected({ fieldType: e.target.value as FieldType })}
                  aria-label="Field type"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="field-editor-meta">
                <span className={`status-badge ${confidenceClass(selected.confidence) === 'high' ? 'ok' : confidenceClass(selected.confidence) === 'mid' ? 'warn' : ''}`}>
                  {Math.round(selected.confidence * 100)}%
                </span>
                <span className="tier-chip tier-src">{selected.source}</span>
                {selected.groupId && (
                  <span className="tier-chip tier-src">{selected.groupId}</span>
                )}
                <button type="button" className="field-editor-delete" onClick={removeSelected}>
                  Remove
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
      className="review-list-compact"
              initial="initial"
              animate="animate"
              exit={{ opacity: 0 }}
              variants={staggerParent}
            >
              {fields.map((f, i) => {
                const cls = confidenceClass(f.confidence)
                return (
                  <motion.button
                    key={f.id}
                    type="button"
                    variants={staggerChild}
                    className="review-list-row"
                    onClick={() => setSelectedId(f.id)}
                  >
                    <span className={`dot ${cls}`} />
                    <span className="review-list-num">{i + 1}</span>
                    <span className="review-list-label">
                      {f.label || <em>Unlabeled</em>}
                    </span>
                    <span className="tier-chip tier-src">{TYPE_LABELS[f.fieldType]}</span>
                  </motion.button>
                )
              })}
              {fields.length === 0 && (
                <p className="review-empty-note">
                  All fields removed — cancel and rescan, or continue without fills.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="wm-dialog-actions review-actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={() => onConfirm(fields)}
            disabled={fields.length === 0}
          >
            Continue with {fields.length} field{fields.length === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
