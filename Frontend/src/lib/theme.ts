/**
 * Theme preference: 'system' follows the OS, 'light' / 'dark' pin it.
 * The choice is written to <html data-theme> (see styles/tokens.css) and
 * persisted so there's no flash on reload — call applyStoredTheme() from
 * the entry module before React mounts.
 */

export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'snappy:theme'

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* storage unavailable */
  }
  applyTheme(pref)
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', pref)
  }
}

/** Resolve what's actually showing right now (never returns 'system'). */
export function resolvedTheme(): 'light' | 'dark' {
  const pref = getThemePreference()
  if (pref !== 'system') return pref
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyStoredTheme(): void {
  applyTheme(getThemePreference())
}
