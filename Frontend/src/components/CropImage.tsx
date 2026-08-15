import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

interface CropImageProps {
  src: string
  onCancel: () => void
  onCrop: (dataUrl: string) => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const HANDLES: DragMode[] = ['nw', 'ne', 'sw', 'se']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function CropImage({ src, onCancel, onCrop }: CropImageProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<{ w: number; h: number; scale: number } | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; box: Box } | null>(null)

  useEffect(() => {
    const img = imgRef.current
    const area = areaRef.current
    if (!img || !area) return
    const fit = () => {
      if (!img.naturalWidth || !img.naturalHeight) return
      const availW = Math.max(40, area.clientWidth)
      const availH = Math.max(40, area.clientHeight)
      const scale = Math.min(1, availW / img.naturalWidth, availH / img.naturalHeight)
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      setView({ w, h, scale })
      setBox((prev) => {
        if (prev) return prev
        const bw = Math.round(w * 0.9)
        const bh = Math.round(h * 0.9)
        return { x: Math.round((w - bw) / 2), y: Math.round((h - bh) / 2), w: bw, h: bh }
      })
    }
    const onResize = () => fit()
    if (img.complete) fit()
    else img.addEventListener('load', fit)
    window.addEventListener('resize', onResize)
    return () => {
      img.removeEventListener('load', fit)
      window.removeEventListener('resize', onResize)
    }
  }, [src])

  const onPointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault()
    const area = areaRef.current
    if (!area || !box) return
    area.setPointerCapture(e.pointerId)
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, box: { ...box } }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !view) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    let { x, y, w, h } = d.box
    const min = 48
    if (d.mode === 'move') {
      x = clamp(x + dx, 0, view.w - w)
      y = clamp(y + dy, 0, view.h - h)
    } else {
      if (d.mode.includes('w')) {
        const nx = clamp(x + dx, 0, x + w - min)
        w += x - nx
        x = nx
      }
      if (d.mode.includes('e')) w = clamp(w + dx, min, view.w - x)
      if (d.mode.includes('n')) {
        const ny = clamp(y + dy, 0, y + h - min)
        h += y - ny
        y = ny
      }
      if (d.mode.includes('s')) h = clamp(h + dy, min, view.h - y)
    }
    setBox({ x, y, w, h })
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const apply = () => {
    const img = imgRef.current
    if (!img || !view || !box) return
    const sx = Math.round(box.x / view.scale)
    const sy = Math.round(box.y / view.scale)
    const sw = Math.max(1, Math.round(box.w / view.scale))
    const sh = Math.max(1, Math.round(box.h / view.scale))
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    onCrop(canvas.toDataURL('image/jpeg', 0.92))
  }

  const reset = () => {
    if (view) setBox({ x: 0, y: 0, w: view.w, h: view.h })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="wm-dialog">
        <DialogHeader className="text-left">
          <DialogTitle>Crop scan</DialogTitle>
          <p className="engine-badge">Drag inside the box to move · corners to resize</p>
        </DialogHeader>

        <div
          className="crop-area"
          ref={areaRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            ref={imgRef}
            src={src}
            alt="Crop preview"
            className="crop-image"
            style={view ? { width: view.w, height: view.h } : undefined}
            draggable={false}
          />
          {view && box && (
            <div
              className="crop-box"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onPointerDown={(e) => onPointerDown(e, 'move')}
            >
              {HANDLES.map((corner) => (
                <div
                  key={corner}
                  className={`crop-handle ${corner}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onPointerDown(e, corner)
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="wm-dialog-actions">
          <Button variant="secondary" onClick={reset}>Reset</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={apply}>Crop</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
