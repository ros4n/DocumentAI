import type { ScanRecord } from './api'

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.floor((start(now) - start(d)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'This week'
  return fmtDate(iso)
}

export function defaultScanName(iso: string): string {
  return `Scan · ${fmtDate(iso)} ${fmtTime(iso)}`
}

export function groupScansByDay(items: ScanRecord[]): Array<{ label: string; items: ScanRecord[] }> {
  const order = ['Today', 'Yesterday', 'This week']
  const groups = new Map<string, ScanRecord[]>()
  for (const s of items) {
    const key = dayLabel(s.created_at)
    const arr = groups.get(key)
    if (arr) arr.push(s)
    else groups.set(key, [s])
  }
  const keys = order.filter((k) => groups.has(k))
  for (const k of [...groups.keys()].sort()) {
    if (!keys.includes(k)) keys.push(k)
  }
  return keys.map((key) => ({ label: key, items: groups.get(key)! }))
}
