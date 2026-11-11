import { useEffect } from 'react'
import { usePrefs } from '@/store/prefs'

/** 테마 설정(시스템/라이트/다크)을 <html class="dark"> 에 반영 */
export function useTheme(): void {
  const theme = usePrefs((s) => s.theme)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!mq?.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq?.addEventListener('change', apply)
    return () => mq?.removeEventListener('change', apply)
  }, [theme])
}
