import { motion } from 'framer-motion'
import ScanBadge from './ScanBadge'
import EmptyState from './EmptyState'
import { dayLabel, defaultScanName, fmtTime } from '../lib/scanFormat'
import { EASE_OUT_SOFT } from '../lib/motion'
import { MagnifyingGlass, Trash, Image as ImageIcon } from './icons'
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-accent text-text-on-accent'
          : 'bg-surface-sunken text-text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

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
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface-raised px-3">
            <MagnifyingGlass size={16} className="shrink-0 text-text-faint" />
            <input
              className="h-10 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search scan text…"
              aria-label="Search scan text"
            />
          </div>
          <span className="shrink-0 text-xs text-text-muted" aria-live="polite">
            <strong className="text-text">{filtered.length}</strong> / {scans.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_CHIPS.map(([value, label]) => (
            <Chip key={`s-${value}`} active={status === value} onClick={() => onStatus(value)}>
              {label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {TYPE_CHIPS.map(([value, label]) => (
            <Chip key={`t-${value}`} active={type === value} onClick={() => onType(value)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-col gap-2">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.28, ease: EASE_OUT_SOFT, delay: Math.min(i * 0.03, 0.24) },
              }}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-2.5 transition-colors hover:border-border-strong"
            >
              <button
                onClick={() => onSelect(s)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {s.preview_image ? (
                  <img
                    className="size-12 shrink-0 rounded-lg border border-border object-cover"
                    src={s.preview_image}
                    alt="Scan preview"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-surface-sunken text-text-faint">
                    <ImageIcon size={22} weight="light" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">
                      {s.name || defaultScanName(s.created_at)}
                    </span>
                    <ScanBadge scan={s} />
                  </div>
                  <span className="text-xs text-text-muted">
                    {dayLabel(s.created_at)} · {fmtTime(s.created_at)}
                  </span>
                </div>
              </button>
              <button
                onClick={() => onDelete(s.id)}
                aria-label={`Delete ${s.name || 'scan'}`}
                title="Delete"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-text-faint transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash size={16} />
              </button>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ImageIcon size={28} weight="light" />}
          title={hasScans ? 'No matching scans' : 'No scans yet'}
          subtitle={
            hasScans
              ? 'Try a different search or filter.'
              : 'Scan a document with the camera or upload one. Every scan lands here automatically.'
          }
          ctaLabel={hasScans ? undefined : 'Start scanning'}
          onCta={hasScans ? undefined : onNewScan}
        />
      )}
    </div>
  )
}
