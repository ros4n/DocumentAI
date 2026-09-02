import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import type { AnimationPlaybackControls } from 'framer-motion'
import { EASE_OUT_SOFT } from '../lib/motion'

interface CompareSliderProps {
  beforeSrc: string
  afterSrc: string
}

/**
 * Drag (or arrow-key) to wipe between the original scan and the filled result.
 * Position lives in a MotionValue, not React state, so dragging renders at full
 * framerate without re-rendering this subtree.
 */
export default function CompareSlider({ beforeSrc, afterSrc }: CompareSliderProps) {
  const pos = useMotionValue(50)
  const reducedMotion = useReducedMotion()
  const introRef = useRef<AnimationPlaybackControls | null>(null)

  useEffect(() => {
    if (reducedMotion) return
    pos.set(22)
    const controls = animate(pos, [22, 72, 50], {
      duration: 1.2,
      delay: 0.25,
      times: [0, 0.62, 1],
      ease: EASE_OUT_SOFT,
    })
    introRef.current = controls
    return () => {
      controls.stop()
      pos.set(50)
    }
  }, [pos, reducedMotion])

  const cancelIntro = () => introRef.current?.stop()

  const clipPath = useTransform(pos, (v) => `inset(0 ${100 - v}% 0 0)`)
  const left = useTransform(pos, (v) => `${v}%`)

  return (
    <div
      className="relative select-none overflow-hidden rounded-2xl border border-border bg-surface-2 [cursor:ew-resize] [touch-action:pan-y]"
      onPointerDown={cancelIntro}
    >
      <img src={afterSrc} alt="Filled form" draggable={false} className="pointer-events-none block w-full" />

      <motion.div className="absolute inset-0 overflow-hidden" style={{ clipPath }} aria-hidden>
        <img
          src={beforeSrc}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </motion.div>

      <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white backdrop-blur-sm">
        Original
      </span>
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-accent/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white backdrop-blur-sm">
        Filled
      </span>

      <motion.div
        className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(33,29,25,0.18),0_2px_10px_rgba(0,0,0,0.25)]"
        style={{ left }}
        aria-hidden
      >
        <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[2.5px] rounded-full bg-white text-text shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
          <span className="h-2.5 w-0.5 rounded-full bg-current opacity-75" />
          <span className="h-2.5 w-0.5 rounded-full bg-current opacity-75" />
        </span>
      </motion.div>

      <input
        type="range"
        className="absolute inset-0 m-0 h-full w-full cursor-[ew-resize] appearance-none bg-transparent opacity-0"
        min={0}
        max={100}
        step={0.5}
        defaultValue={50}
        onChange={(e) => {
          cancelIntro()
          pos.set(Number(e.target.value))
        }}
        aria-label="Compare original and filled form"
      />
    </div>
  )
}
