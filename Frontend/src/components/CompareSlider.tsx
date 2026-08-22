import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import type { AnimationPlaybackControls } from 'framer-motion'
import { EASE_OUT_SOFT } from '../lib/motion'

interface CompareSliderProps {
  beforeSrc: string
  afterSrc: string
}

/**
 * Interactive before/after comparison — drag (or use arrow keys) to wipe
 * between the original scan and the AI-filled result.
 *
 * Position lives in a MotionValue (not React state): the clip-path and
 * divider transform read it directly, so dragging renders at full framerate
 * without re-rendering this subtree.
 */
export default function CompareSlider({
  beforeSrc,
  afterSrc,
}: CompareSliderProps) {
  const pos = useMotionValue(50)
  const reducedMotion = useReducedMotion()
  const introRef = useRef<AnimationPlaybackControls | null>(null)

  // One-time affordance sweep so users discover the control
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
    <div className="compare-slider" onPointerDown={cancelIntro}>
      <img src={afterSrc} alt="Filled form" draggable={false} />

      <motion.div className="compare-top-layer" style={{ clipPath }} aria-hidden>
        <img src={beforeSrc} alt="" draggable={false} />
      </motion.div>

      <span className="compare-tag before">Original</span>
      <span className="compare-tag after">Filled</span>

      <motion.div className="compare-divider" style={{ left }} aria-hidden>
        <span className="compare-grip" />
      </motion.div>

      {/* Uncontrolled — the MotionValue is the source of truth */}
      <input
        type="range"
        className="compare-range"
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
      <span className="compare-focus-ring" aria-hidden />
    </div>
  )
}
