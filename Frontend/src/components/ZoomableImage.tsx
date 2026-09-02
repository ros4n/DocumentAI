import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '../lib/utils'
import { Plus, Minus, ArrowCounterClockwise } from './icons'

interface ZoomableImageProps {
  src: string
  alt?: string
  className?: string
  onClick?: () => void
}

interface ViewState {
  scale: number
  x: number
  y: number
}

const zoomBtn =
  'grid size-[30px] place-items-center rounded-full border border-border-strong bg-surface-raised text-text shadow-sm disabled:opacity-40'

export function ZoomableImage({ src, alt = '', className = '', onClick }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef<ViewState>({ scale: 1, x: 0, y: 0 })
  const [fitScale, setFitScale] = useState(0)
  const fitRef = useRef(0)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)

  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ dist0: number; scale0: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const apply = (next: ViewState) => {
    viewRef.current = next
    setView(next)
  }

  const clampScale = (s: number) => Math.min(8, Math.max(1, s))

  const containerSize = () => {
    const el = containerRef.current
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 }
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const resize = () => {
      if (natural.w === 0 || natural.h === 0) return
      const { w: cw, h: ch } = containerSize()
      if (cw === 0 || ch === 0) return
      const fs = Math.min(cw / natural.w, ch / natural.h)
      fitRef.current = fs
      setFitScale(fs)
      const v = viewRef.current
      if (v.scale <= 1.0001) apply({ scale: 1, x: 0, y: 0 })
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [natural])

  const zoomAt = (px: number, py: number, factor: number) => {
    const v = viewRef.current
    const total0 = fitRef.current * v.scale
    const s = clampScale(v.scale * factor)
    const total1 = fitRef.current * s
    const mx = (px - v.x) / total0
    const my = (py - v.y) / total0
    apply({ scale: s, x: px - mx * total1, y: py - my * total1 })
  }

  const reset = () => apply({ scale: 1, x: 0, y: 0 })

  const onWheel = (e: WheelEvent) => {
    if (natural.w === 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    e.preventDefault()
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.18 : 1 / 1.18)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [natural])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (natural.w === 0) return
    const el = containerRef.current
    if (el) el.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      dragRef.current = null
      const pts = [...pointersRef.current.values()]
      pinchRef.current = {
        dist0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        scale0: viewRef.current.scale,
      }
    } else if (viewRef.current.scale > 1.0001) {
      dragRef.current = { x: viewRef.current.x, y: viewRef.current.y }
      setDragging(true)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pts = pointersRef.current
    if (!pts.has(e.pointerId)) return
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinchRef.current && pts.size === 2) {
      const [a, b] = [...pts.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (dist === 0) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const midX = (a.x + b.x) / 2 - rect.left
      const midY = (a.y + b.y) / 2 - rect.top
      const v = viewRef.current
      const s = clampScale(pinchRef.current.scale0 * (dist / pinchRef.current.dist0))
      const total0 = fitRef.current * v.scale
      const total1 = fitRef.current * s
      const mx = (midX - v.x) / total0
      const my = (midY - v.y) / total0
      apply({ scale: s, x: midX - mx * total1, y: midY - my * total1 })
      return
    }

    if (dragRef.current) {
      const p0 = pts.get(e.pointerId)
      if (!p0) return
      const dx = e.clientX - p0.x
      const dy = e.clientY - p0.y
      apply({ scale: viewRef.current.scale, x: dragRef.current.x + dx, y: dragRef.current.y + dy })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) {
      dragRef.current = null
      setDragging(false)
    }
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (natural.w === 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    if (viewRef.current.scale > 1.0001) reset()
    else zoomAt(e.clientX - rect.left, e.clientY - rect.top, 2)
  }

  const total = fitScale * view.scale
  const transform =
    natural.w === 0 ? 'none' : `translate(${view.x}px, ${view.y}px) scale(${total})`

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-[min(55dvh,520px)] touch-none select-none overflow-hidden rounded-xl border border-border bg-surface-sunken',
        view.scale > 1 ? 'cursor-grab' : onClick ? 'cursor-zoom-in' : 'cursor-grab',
        dragging && 'cursor-grabbing',
        className
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget
          setNatural({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        className="absolute left-0 top-0 h-auto w-auto max-w-none origin-top-left [will-change:transform]"
        style={{ transform }}
      />
      <div className="absolute bottom-2 right-2 z-[3] flex gap-1.5">
        <button
          className={zoomBtn}
          onClick={(e) => {
            e.stopPropagation()
            zoomAt(containerRef.current!.clientWidth / 2, containerRef.current!.clientHeight / 2, 1.25)
          }}
          aria-label="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          className={zoomBtn}
          onClick={(e) => {
            e.stopPropagation()
            zoomAt(containerRef.current!.clientWidth / 2, containerRef.current!.clientHeight / 2, 0.8)
          }}
          aria-label="Zoom out"
        >
          <Minus size={14} />
        </button>
        <button
          className={zoomBtn}
          onClick={(e) => {
            e.stopPropagation()
            reset()
          }}
          disabled={view.scale <= 1.0001}
          aria-label="Reset zoom"
        >
          <ArrowCounterClockwise size={14} />
        </button>
      </div>
    </div>
  )
}
