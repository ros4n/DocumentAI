import { motion } from 'framer-motion'
import ScanBadge from './ScanBadge'
import EmptyState from './EmptyState'
import { groupScansByDay } from '../lib/scanFormat'
import { EASE_OUT_SOFT } from '../lib/motion'
import { Image as ImageIcon, ClockCounterClockwise } from './icons'
import type { ScanRecord } from '../lib/api'

interface HistoryListProps {
  scans: ScanRecord[]
  filtered: ScanRecord[]
  onSelect: (scan: ScanRecord) => void
  onNewScan: () => void
}

export default function HistoryList({ scans, filtered, onSelect, onNewScan }: HistoryListProps) {
  const hasScans = scans.length > 0

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={<ClockCounterClockwise size={28} weight="light" />}
        title={hasScans ? 'No matching activity' : 'Nothing here yet'}
        subtitle={
          hasScans
            ? 'Try a different search or filter.'
            : 'Your OCR and form-filling activity will be listed here.'
        }
        ctaLabel={hasScans ? undefined : 'Scan your first document'}
        onCta={hasScans ? undefined : onNewScan}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groupScansByDay(filtered).map((group, gi) => (
        <motion.div
          key={group.label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: EASE_OUT_SOFT, delay: Math.min(gi * 0.05, 0.2) }}
        >
          <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-text-faint">
            {group.label}
          </h3>
          <div className="flex flex-col gap-1.5">
            {group.items.map((s, i) => (
              <motion.button
                key={s.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.24, ease: EASE_OUT_SOFT, delay: Math.min(i * 0.03, 0.2) },
                }}
                onClick={() => onSelect(s)}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-2.5 text-left transition-colors hover:border-border-strong"
              >
                {s.preview_image ? (
                  <img
                    className="size-11 shrink-0 rounded-lg border border-border object-cover"
                    src={s.preview_image}
                    alt="Scan preview"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-sunken text-text-faint">
                    <ImageIcon size={18} weight="light" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">
                      {s.name || `Scan · ${s.created_at}`}
                    </span>
                    <ScanBadge scan={s} />
                  </div>
                  <span className="text-xs text-text-muted">
                    {new Date(s.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {s.pages} page{s.pages === 1 ? '' : 's'}
                    {s.ocr_engine === 'server' ? ' · server OCR' : ''}
                    {s.ocr_engine === 'backend' ? ' · API OCR' : ''}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
