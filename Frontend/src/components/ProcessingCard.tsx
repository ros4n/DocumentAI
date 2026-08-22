import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EASE_OUT_SOFT } from '../lib/motion'

interface ProcessingCardProps {
  title: string
  steps: string[]
  /** Parent-known stage index; when omitted the card advances on a timer */
  forceStep?: number
  note?: string
  fallback?: string | null
}

/**
 * Reflects the tiered OCR / AI-fill pipeline so users understand why
 * processing is sometimes fast (server hit) and sometimes slow
 * (falling back through the chain) instead of staring at a bare spinner.
 */
export default function ProcessingCard({
  title,
  steps,
  forceStep,
  note,
  fallback,
}: ProcessingCardProps) {
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
      className="pipeline-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28, ease: EASE_OUT_SOFT }}
      role="status"
      aria-live="polite"
    >
      <div className="pipeline-progress" aria-hidden>
        <motion.div
          className="pipeline-progress-bar"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT_SOFT }}
        />
      </div>

      <p className="review-group" style={{ fontSize: 14.5 }}>{title}</p>

      <div className="pipeline-steps">
        {steps.map((label, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending'
          return (
            <div key={label} className={`pipeline-step ${state}`}>
              <span className="pipeline-step-dot" aria-hidden>
                {state === 'done' && (
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span>{label}</span>
            </div>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {note && (
          <motion.p
            key={note}
            className="pipeline-note"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT_SOFT }}
          >
            {note}
          </motion.p>
        )}
        {fallback && (
          <motion.span
            key={fallback}
            className="pipeline-fallback"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT_SOFT }}
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
            {fallback}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
