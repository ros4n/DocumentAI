import type { ReactNode } from 'react'

type Tone = 'neutral' | 'ok' | 'warn' | 'ai'

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-muted',
  ok: 'bg-accent-soft text-accent-hover',
  warn: 'bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning',
  ai: 'bg-accent-soft text-accent-hover',
}

export function StatusPill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE[tone]}`}>{children}</span>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{children}</div>
}
