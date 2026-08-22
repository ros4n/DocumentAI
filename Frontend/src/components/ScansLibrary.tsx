import { AnimatePresence, motion } from 'framer-motion'
import { Button } from './ui/button'
import ScanBadge from './ScanBadge'
import { dayLabel, defaultScanName, fmtTime } from '../lib/scanFormat'
import { EASE_OUT_SOFT } from '../lib/motion'
import type { ScanRecord } from '../lib/api'

interface ScansLibraryProps {
  scans: ScanRecord[]
  filtered: ScanRecord[]
  search: string
  onSearch: (v: string) => void
  status: string
  onStatus: (v: string) => void
  type: string
  onType: (v: string) => void
  onSelect: (scan: ScanRecord) => void
  onDelete: (id: number) => void
  onNewScan: () => void
}

const STATUS_CHIPS: Array<[string, string]> = [
  ['', 'All'],
  ['ocr', 'OCR only'],
  ['filled', 'Filled'],
]

const TYPE_CHIPS: Array<[string, string]> = [
  ['', 'All'],
  ['image', 'Images'],
  ['pdf', 'PDFs'],
]

const ThumbPlaceholder = ({ size }: { size: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </svg>
)

export default function ScansLibrary({
  scans,
  filtered,
  search,
  onSearch,
  status,
  onStatus,
  type,
  onType,
  onSelect,
  onDelete,
  onNewScan,
}: ScansLibraryProps) {
  const hasScans = scans.length > 0

  return (
    <div className="library-page">
      <div className="scan-toolbar">
        <div className="toolbar-row">
          <div className="search-box">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="search-input"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search scan text…"
              aria-label="Search scan text"
            />
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={filtered.length}
              className="result-count"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: EASE_OUT_SOFT }}
              aria-live="polite"
            >
              <strong>{filtered.length}</strong> / {scans.length}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="chip-row">
          {STATUS_CHIPS.map(([value, label]) => (
            <button
              key={`s-${value}`}
              className={status === value ? 'chip active' : 'chip'}
              onClick={() => onStatus(value)}
              aria-pressed={status === value}
            >
              {label}
            </button>
          ))}
          <span className="chip-divider" />
          {TYPE_CHIPS.map(([value, label]) => (
            <button
              key={`t-${value}`}
              className={type === value ? 'chip active' : 'chip'}
              onClick={() => onType(value)}
              aria-pressed={type === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <motion.div layout className="scan-grid">
          <AnimatePresence mode="popLayout" initial={hasScans}>
            {filtered.map((s, i) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    duration: 0.3,
                    ease: EASE_OUT_SOFT,
                    delay: Math.min(i * 0.04, 0.32),
                  },
                }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                className="scan-card-wrap"
              >
                <div className="scan-card" onClick={() => onSelect(s)}>
                  {s.preview_image ? (
                    <img className="scan-thumb" src={s.preview_image} alt="Scan preview" />
                  ) : (
                    <div className="scan-thumb scan-thumb-empty">
                      <ThumbPlaceholder size={26} />
                    </div>
                  )}
                  <div className="scan-card-body">
                    <div className="scan-card-top">
                      <span className="scan-name">{s.name || defaultScanName(s.created_at)}</span>
                      <ScanBadge scan={s} />
                    </div>
                    <span className="scan-date">
                      {dayLabel(s.created_at)} · {fmtTime(s.created_at)}
                    </span>
                  </div>
                  <button
                    className="icon-btn scan-card-del"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(s.id)
                    }}
                    aria-label={`Delete ${s.name || 'scan'}`}
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <EmptyState
          title={hasScans ? 'No matching scans' : 'No scans yet'}
          subtitle={
            hasScans
              ? 'Try a different search or filter'
              : 'Scan a document with the camera or upload one — every scan lands here automatically.'
          }
          ctaLabel={hasScans ? undefined : 'Start scanning'}
          onCta={hasScans ? undefined : onNewScan}
        />
      )}
    </div>
  )
}

export function EmptyState({
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  title: string
  subtitle: string
  ctaLabel?: string
  onCta?: () => void
}) {
  return (
    <motion.div
      className="empty-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_SOFT }}
    >
      <div className="empty-icon">
        <ThumbPlaceholder size={30} />
      </div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {ctaLabel && onCta && (
        <Button className="empty-cta" onClick={onCta}>
          {ctaLabel}
        </Button>
      )}
    </motion.div>
  )
}
