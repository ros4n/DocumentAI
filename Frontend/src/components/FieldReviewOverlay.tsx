import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { StatusPill, DialogActions } from './dialogs/_shared'
import { CursorClick, BoundingBox as BoundingBoxIcon, ArrowCounterClockwise } from './icons'
import { staggerChild, staggerParent } from '../lib/motion'
import { FIELD_TYPES } from '../lib/types'
import type { BoundingBox, DetectedField, FieldDetectionResult, FieldType } from '../lib/types'

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

const BOX_TONE: Record<'high' | 'mid' | 'low', string> = {
  high: 'border-success bg-success/10',
  mid: 'border-warning bg-warning/10',
  low: 'border-danger bg-danger/10',
}
const DOT_TONE: Record<'high' | 'mid' | 'low', string> = {
  high: 'bg-success',
  mid: 'bg-warning',
  low: 'bg-danger',
}

const selectCls =
  'h-10 rounded-lg border border-border bg-surface-raised px-3 text-sm text-text outline-none focus:border-accent'

type Mode = 'select' | 'draw'
type HandleDir = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
const HANDLES: HandleDir[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']
const HANDLE_STYLE: Record<HandleDir, string> = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_SIZE = 8

export default function FieldReviewOverlay({
  imageDataUrl,
  detection,
  onConfirm,
  onCancel,
}: FieldReviewOverlayProps) {
  const pw = Math.max(1, detection.pageWidth)
  const ph = Math.max(1, detection.pageHeight)

  const [fields, setFields] = useState<DetectedField[]>(detection.fields)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('select')
  const [drawRect, setDrawRect] = useState<BoundingBox | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<
    | { id: string; kind: 'move' | HandleDir; startImg: { x: number; y: number }; startBox: BoundingBox }
    | {
        id: '__draw__'
        kind: 'draw'
        startImg: { x: number; y: number }
        startBox: BoundingBox
        rect: BoundingBox
      }
    | null
  >(null)

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId]
  )

  const clientToImg = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: clamp(((clientX - rect.left) / rect.width) * pw, 0, pw),
      y: clamp(((clientY - rect.top) / rect.height) * ph, 0, ph),
    }
  }

  const updateSelected = (patch: Partial<DetectedField>) => {
    if (!selectedId) return
    setFields((prev) => prev.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)))
  }

  const removeSelected = () => {
    if (!selectedId) return
    setFields((prev) => prev.filter((f) => f.id !== selectedId))
    setSelectedId(null)
  }

  const resetFields = () => {
    setFields(detection.fields)
    setSelectedId(null)
    setMode('select')
  }

  /* ── Pointer interaction ─────────────────────────────────────────── */

  const beginBoxDrag = (
    e: ReactPointerEvent,
    field: DetectedField,
    kind: 'move' | HandleDir
  ) => {
    e.stopPropagation()
    e.preventDefault()
    try { canvasRef.current?.setPointerCapture(e.pointerId) } catch { /* synthetic / unsupported */ }
    setSelectedId(field.id)
    dragRef.current = {
      id: field.id,
      kind,
      startImg: clientToImg(e.clientX, e.clientY),
      startBox: { ...field.bbox },
    }
  }

  const onCanvasPointerDown = (e: ReactPointerEvent) => {
    if (mode === 'draw') {
      e.preventDefault()
      try { canvasRef.current?.setPointerCapture(e.pointerId) } catch { /* synthetic / unsupported */ }
      const p = clientToImg(e.clientX, e.clientY)
      const zero = { x: p.x, y: p.y, width: 0, height: 0 }
      dragRef.current = { id: '__draw__', kind: 'draw', startImg: p, startBox: zero, rect: zero }
      setDrawRect(zero)
    } else {
      // click on empty image → deselect
      setSelectedId(null)
    }
  }

  const onCanvasPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const cur = clientToImg(e.clientX, e.clientY)
    const dx = cur.x - d.startImg.x
    const dy = cur.y - d.startImg.y

    if (d.kind === 'draw') {
      const rect = {
        x: Math.min(d.startImg.x, cur.x),
        y: Math.min(d.startImg.y, cur.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }
      d.rect = rect
      setDrawRect(rect)
      return
    }

    let { x, y, width, height } = d.startBox
    if (d.kind === 'move') {
      x = clamp(x + dx, 0, pw - width)
      y = clamp(y + dy, 0, ph - height)
    } else {
      if (d.kind.includes('w')) {
        const right = x + width
        const nx = clamp(x + dx, 0, right - MIN_SIZE)
        width = right - nx
        x = nx
      }
      if (d.kind.includes('e')) width = clamp(width + dx, MIN_SIZE, pw - x)
      if (d.kind.includes('n')) {
        const bottom = y + height
        const ny = clamp(y + dy, 0, bottom - MIN_SIZE)
        height = bottom - ny
        y = ny
      }
      if (d.kind.includes('s')) height = clamp(height + dy, MIN_SIZE, ph - y)
    }
    setFields((prev) =>
      prev.map((f) => (f.id === d.id ? { ...f, bbox: { x, y, width, height } } : f))
    )
  }

  const onCanvasPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d?.kind === 'draw') {
      const r = d.rect
      if (r.width >= MIN_SIZE * 2 && r.height >= MIN_SIZE) {
        const id = `manual_${Date.now().toString(36)}`
        setFields((prev) => [
          ...prev,
          {
            id,
            label: '',
            fieldType: 'text_line',
            bbox: {
              x: Math.round(r.x),
              y: Math.round(r.y),
              width: Math.round(r.width),
              height: Math.round(r.height),
            },
            confidence: 1,
            source: 'cv',
          },
        ])
        setSelectedId(id)
      }
      setDrawRect(null)
      setMode('select')
    }
  }

  const pct = (b: BoundingBox) => ({
    left: `${(b.x / pw) * 100}%`,
    top: `${(b.y / ph) * 100}%`,
    width: `${(b.width / pw) * 100}%`,
    height: `${(b.height / ph) * 100}%`,
  })

  const counts = {
    high: fields.filter((f) => confidenceClass(f.confidence) === 'high').length,
    mid: fields.filter((f) => confidenceClass(f.confidence) === 'mid').length,
    low: fields.filter((f) => confidenceClass(f.confidence) === 'low').length,
  }

  const tierLabel =
    detection.tierUsed === 'acroform'
      ? 'PDF form layer'
      : detection.tierUsed === 'vlm'
        ? 'AI vision'
        : 'On-device'

  const dirty = fields !== detection.fields

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="wm-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">Review detected fields</DialogTitle>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">Detected fields</h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {counts.high} confident · {counts.mid} unsure · {counts.low} need review
              <StatusPill tone={detection.tierUsed === 'cv' ? 'neutral' : 'ai'}>{tierLabel}</StatusPill>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex rounded-full bg-surface-sunken p-0.5 text-[11px] font-medium">
              <button
                onClick={() => setMode('select')}
                className={`flex items-center gap-1 rounded-full px-2 py-1 ${mode === 'select' ? 'bg-surface-raised text-text shadow-sm' : 'text-text-muted'}`}
              >
                <CursorClick size={12} />
                Edit
              </button>
              <button
                onClick={() => {
                  setMode('draw')
                  setSelectedId(null)
                }}
                className={`flex items-center gap-1 rounded-full px-2 py-1 ${mode === 'draw' ? 'bg-surface-raised text-text shadow-sm' : 'text-text-muted'}`}
              >
                <BoundingBoxIcon size={12} />
                Add box
              </button>
            </div>
            {dirty && (
              <button
                onClick={resetFields}
                title="Reset to detected"
                className="grid size-7 place-items-center rounded-full text-text-faint hover:text-text"
              >
                <ArrowCounterClockwise size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[46dvh] overflow-auto rounded-xl border border-border">
          <div
            ref={canvasRef}
            className={`relative select-none ${mode === 'draw' ? 'cursor-crosshair' : ''}`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          >
            <img
              src={imageDataUrl}
              alt="Form page"
              draggable={false}
              className="pointer-events-none block w-full"
            />

            {fields.map((f, i) => {
              const cls = confidenceClass(f.confidence)
              const isSel = selectedId === f.id
              return (
                <div
                  key={f.id}
                  style={pct(f.bbox)}
                  onPointerDown={(e) => mode === 'select' && beginBoxDrag(e, f, 'move')}
                  className={`absolute rounded border-2 ${BOX_TONE[cls]} ${
                    mode === 'select' ? 'cursor-move' : 'pointer-events-none'
                  } ${isSel ? 'z-10 ring-[3px] ring-accent/40' : ''}`}
                >
                  <span className="pointer-events-none absolute -left-1.5 -top-[9px] flex h-4 min-w-4 items-center justify-center rounded-full bg-black/80 px-[3px] font-mono text-[9px] text-white">
                    {i + 1}
                  </span>
                  {isSel && mode === 'select' &&
                    HANDLES.map((h) => (
                      <span
                        key={h}
                        onPointerDown={(e) => beginBoxDrag(e, f, h)}
                        className={`absolute size-2.5 rounded-[3px] border-2 border-white bg-accent ${HANDLE_STYLE[h]}`}
                      />
                    ))}
                </div>
              )
            })}

            {drawRect && (
              <div
                style={pct(drawRect)}
                className="pointer-events-none absolute rounded border-2 border-dashed border-accent bg-accent/10"
              />
            )}
          </div>
        </div>

        {mode === 'draw' && (
          <p className="text-center text-xs text-text-muted">
            Drag on the form to draw a field box.
          </p>
        )}

        {selected ? (
          <motion.div
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 text-sm text-text outline-none focus:border-accent"
                value={selected.label}
                onChange={(e) => updateSelected({ label: e.target.value })}
                placeholder="What should this field be called?"
                aria-label="Field label"
                autoFocus
              />
              <select
                className={selectCls}
                value={selected.fieldType}
                onChange={(e) => updateSelected({ fieldType: e.target.value as FieldType })}
                aria-label="Field type"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={
                  confidenceClass(selected.confidence) === 'high'
                    ? 'ok'
                    : confidenceClass(selected.confidence) === 'mid'
                      ? 'warn'
                      : 'neutral'
                }
              >
                {Math.round(selected.confidence * 100)}%
              </StatusPill>
              <StatusPill>{selected.source === 'cv' && selected.id.startsWith('manual_') ? 'manual' : selected.source}</StatusPill>
              {selected.groupId && <StatusPill>{selected.groupId}</StatusPill>}
              <button
                type="button"
                onClick={removeSelected}
                className="ml-auto text-xs font-medium text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="flex max-h-[26vh] flex-col gap-1 overflow-auto"
            initial="initial"
            animate="animate"
            variants={staggerParent}
          >
            {fields.map((f, i) => {
              const cls = confidenceClass(f.confidence)
              return (
                <motion.button
                  key={f.id}
                  type="button"
                  variants={staggerChild}
                  onClick={() => {
                    setMode('select')
                    setSelectedId(f.id)
                  }}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left hover:border-border-strong"
                >
                  <span className={`size-2 shrink-0 rounded-full ${DOT_TONE[cls]}`} />
                  <span className="font-mono text-xs text-text-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {f.label || <em className="text-text-faint">Unlabeled</em>}
                  </span>
                  <StatusPill>{TYPE_LABELS[f.fieldType]}</StatusPill>
                </motion.button>
              )
            })}
            {fields.length === 0 && (
              <p className="px-1 py-3 text-center text-xs text-text-muted">
                No fields. Switch to "Add box" and draw one, or cancel and rescan.
              </p>
            )}
          </motion.div>
        )}

        <DialogActions>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(fields)} disabled={fields.length === 0}>
            Continue with {fields.length} field{fields.length === 1 ? '' : 's'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
