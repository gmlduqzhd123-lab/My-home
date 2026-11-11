import { useEffect, useMemo } from 'react'
import { newAlerts, todayKst } from '@/lib/alerts'
import { loadAlerts, useResource } from '@/lib/data'
import { usePrefs } from '@/store/prefs'
import type { AlertItem, AlertsFile } from '@/types'

/** 청약 알림 목록과 "마지막 확인 이후 새 공고" */
export function useAlerts(): { file: AlertsFile | null; loading: boolean; fresh: AlertItem[]; today: string } {
  const res = useResource('alerts', loadAlerts)
  const seenAt = usePrefs((s) => s.alertsSeenAt)
  const today = todayKst()
  const file = res.status === 'ok' ? res.data : null
  const fresh = useMemo(() => (file ? newAlerts(file.items, seenAt, today) : []), [file, seenAt, today])
  return { file, loading: res.status === 'loading' || res.status === 'idle', fresh, today }
}

const NOTIFIED_KEY = 'suncheon-zip:alerts-notified'

export function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * 브라우저 알림: 사용자가 켜 두었고 권한이 있으면, 앱을 열었을 때 새 공고를 한 번 알린다.
 * 서버가 없어 앱이 닫혀 있을 때는 보낼 수 없다.
 */
export function useAlertNotifier(): void {
  const { file, fresh } = useAlerts()
  const enabled = usePrefs((s) => s.notify)

  useEffect(() => {
    if (!enabled || !file || fresh.length === 0 || !notificationSupported() || Notification.permission !== 'granted') return
    try {
      if (localStorage.getItem(NOTIFIED_KEY) === file.generatedAt) return // 같은 수집분으로는 한 번만
    } catch {
      return
    }
    const title = `순천 청약 새 공고 ${fresh.length}건`
    const body = fresh
      .slice(0, 3)
      .map((i) => i.title)
      .join('\n')
    const options: NotificationOptions = { body, tag: 'suncheon-zip-alerts', icon: `${import.meta.env.BASE_URL}icon-192.png` }
    const show = async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration()
        if (reg) await reg.showNotification(title, options)
        else new Notification(title, options)
        localStorage.setItem(NOTIFIED_KEY, file.generatedAt)
      } catch {
        // 알림을 띄우지 못해도 앱 동작에는 영향이 없다(앱 안 배지로 확인 가능)
      }
    }
    void show()
  }, [enabled, file, fresh])
}
