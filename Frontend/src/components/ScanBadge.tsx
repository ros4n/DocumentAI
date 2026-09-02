import type { ScanRecord } from '../lib/api'

export default function ScanBadge({ scan }: { scan: ScanRecord }) {
  const filled = !!scan.filled_at
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        filled ? 'bg-accent-soft text-accent-hover' : 'bg-surface-sunken text-text-muted'
      }`}
    >
      {filled ? 'Filled' : 'OCR'}
    </span>
  )
}
