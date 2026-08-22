import type { Transition } from 'framer-motion'

export const EASE_OUT_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const EASE_SHEET: [number, number, number, number] = [0.32, 0.72, 0, 1]

export const springSoft: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 34,
  mass: 0.9,
}

export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 38,
  mass: 0.8,
}

export const fadeSlide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
}

export const staggerParent = {
  animate: { transition: { staggerChildren: 0.045 } },
}

export const staggerChild = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT_SOFT } },
}
