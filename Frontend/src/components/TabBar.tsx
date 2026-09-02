import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { House, Images, ClockCounterClockwise, User } from './icons'

export type Tab = 'home' | 'scans' | 'history' | 'profile'

const TABS: Array<{ key: Tab; label: string; icon: (active: boolean) => ReactNode }> = [
  { key: 'home', label: 'Home', icon: (a) => <House size={22} weight={a ? 'fill' : 'regular'} /> },
  { key: 'scans', label: 'Scans', icon: (a) => <Images size={22} weight={a ? 'fill' : 'regular'} /> },
  { key: 'history', label: 'History', icon: (a) => <ClockCounterClockwise size={22} weight={a ? 'fill' : 'regular'} /> },
  { key: 'profile', label: 'Profile', icon: (a) => <User size={22} weight={a ? 'fill' : 'regular'} /> },
]

interface TabBarProps {
  tab: Tab
  onTabChange: (tab: Tab) => void
}

export default function TabBar({ tab, onTabChange }: TabBarProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="sticky bottom-0 z-30 mt-auto flex justify-around border-t border-border bg-surface-raised px-2 pt-2 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] rounded-t-2xl sm:rounded-b-[32px]"
    >
      {TABS.map(({ key, label, icon }) => {
        const active = tab === key
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            aria-current={active ? 'page' : undefined}
            className="relative flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 transition-colors"
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl bg-accent-soft"
                transition={{ type: 'spring', stiffness: 480, damping: 40 }}
              />
            )}
            <span className={`relative ${active ? 'text-accent' : 'text-text-faint'}`}>
              {icon(active)}
            </span>
            <span
              className={`relative text-[11px] font-semibold ${active ? 'text-accent' : 'text-text-faint'}`}
            >
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
