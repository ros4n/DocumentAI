import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { EASE_OUT_SOFT } from '../lib/motion'
import { Check } from './icons'

interface ProcessingCardProps {
  title: string
  steps: string[]
  /** Parent-known stage index; when omitted the card advances on a timer */
  forceStep?: number
  note?: string
}

/**
 * Reflects the tiered OCR / AI-fill pipeline so users understand why
 * processing is sometimes fast (server hit) and sometimes slow
 * (falling back through the chain) instead of staring at a bare spinner.
 */
export default function ProcessingCard({ title, steps, forceStep, note }: ProcessingCardProps) {
  const [estimate, setEstimate] = useState(0)
  const total = Math.max(steps.length, 1)

  useEffect(() => {
    if (forceStep !== undefined) return
    setEstimate(0)
    const timer = window.setInterval(() => {
      setEstimate((prev) => Math.min(prev + 1, total - 1))
    }, 2400)
    return () => window.clearInterval(timer)
  }, [forceStep, total])

  const currentStep = forceStep ?? estimate
  const progress = Math.min(100, Math.round(((currentStep + 0.5) / total) * 100))

  return (
    <motion.div
      className="w-full max-w-[280px] rounded-2xl border border-border bg-surface-raised p-4 shadow-lg"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT_SOFT }}
      role="status"
      aria-live="polite"
    >
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT_SOFT }}
        />
      </div>

      <p className="mb-3 font-display text-sm font-semibold">{title}</p>

      <div className="flex flex-col gap-2">
        {steps.map((label, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending'
          return (
            <div
              key={label}
              className={`flex items-center gap-2.5 text-[13px] ${
                state === 'pending' ? 'text-text-faint' : 'text-text'
              }`}
            >
              <span
                className={`grid size-4 shrink-0 place-items-center rounded-full ${
                  state === 'done'
                    ? 'bg-accent'
                    : state === 'active'
                      ? 'border-2 border-accent'
                      : 'border-2 border-border-strong'
                }`}
              >
                {state === 'done' && <Check size={11} weight="bold" color="#fff" />}
              </span>
              <span>{label}</span>
            </div>
          )
        })}
      </div>

      {note && <p className="mt-3 text-xs text-text-muted">{note}</p>}
    </motion.div>
  )
}
