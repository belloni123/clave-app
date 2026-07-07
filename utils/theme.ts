export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'clave_theme'

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) || 'dark'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
