import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { EASE_OUT_SOFT } from '../lib/motion'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  subtitle: string
  ctaLabel?: string
  onCta?: () => void
}

export default function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_SOFT }}
    >
      <div className="grid size-14 place-items-center rounded-2xl border border-border bg-surface-sunken text-text-faint">
        {icon}
      </div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="max-w-[34ch] text-sm leading-relaxed text-text-muted">{subtitle}</p>
      {ctaLabel && onCta && (
        <Button className="mt-2" onClick={onCta}>
          {ctaLabel}
        </Button>
      )}
    </motion.div>
  )
}
