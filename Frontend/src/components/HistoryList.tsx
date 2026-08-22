import { AnimatePresence, motion } from 'framer-motion'
import ScanBadge from './ScanBadge'
import { EmptyState } from './ScansLibrary'
import { groupScansByDay } from '../lib/scanFormat'
import { EASE_OUT_SOFT } from '../lib/motion'
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
        title={hasScans ? 'No matching activity' : 'Nothing here yet'}
        subtitle={
          hasScans
            ? 'Try a different search or filter'
            : 'Your OCR and form-filling activity will be listed here.'
        }
        ctaLabel={hasScans ? undefined : 'Scan your first document'}
        onCta={hasScans ? undefined : onNewScan}
      />
    )
  }

  return (
    <div className="history-page">
      <div className="history-list">
        {groupScansByDay(filtered).map((group, gi) => (
          <motion.div
            key={group.label}
            className="history-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: EASE_OUT_SOFT, delay: Math.min(gi * 0.05, 0.2) }}
          >
            <h3>{group.label}</h3>
            <AnimatePresence initial={false}>
              {group.items.map((s, i) => (
                <motion.button
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.28,
                      ease: EASE_OUT_SOFT,
                      delay: Math.min(i * 0.04, 0.28),
                    },
                  }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                  className="history-item"
                  onClick={() => onSelect(s)}
                >
                  {s.preview_image ? (
                    <img className="history-thumb" src={s.preview_image} alt="Scan preview" />
                  ) : (
                    <div className="history-thumb history-thumb-empty">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="4" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                      </svg>
                    </div>
                  )}
                  <div className="history-meta">
                    <div className="history-top">
                      <span className="history-title">
                        {s.name || `Scan · ${s.created_at}`}
                      </span>
                      <ScanBadge scan={s} />
                    </div>
                    <span className="history-time">
                      {new Date(s.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ·{' '}
                      {s.pages} page{s.pages === 1 ? '' : 's'}
                      {s.ocr_engine === 'server' ? ' · server OCR' : ''}
                      {s.ocr_engine === 'backend' ? ' · API OCR' : ''}
                    </span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
