import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ALL_ZONE, ZONES } from '@/config/zones'

export const MAX_COMPARE = 4
export const PREFS_KEY = 'suncheon-zip:prefs'

export type Theme = 'system' | 'light' | 'dark'

export interface PrefsState {
  theme: Theme
  zoneId: string
  favorites: string[]
  favoriteZones: string[]
  compare: string[]
  /** 청약 알림을 마지막으로 '모두 확인'한 수집 시각 */
  alertsSeenAt: string | null
  /** 브라우저 알림 사용 여부(권한은 브라우저가 따로 관리) */
  notify: boolean
  markAlertsSeen: (iso: string) => void
  setNotify: (on: boolean) => void
  setTheme: (t: Theme) => void
  setZone: (id: string) => void
  toggleFavorite: (id: string) => void
  toggleFavoriteZone: (id: string) => void
  /** 추가 성공 여부(최대 4개 초과 시 false) */
  addCompare: (id: string) => boolean
  removeCompare: (id: string) => void
  setCompare: (ids: string[]) => void
  clearCompare: () => void
  replaceSaved: (data: SavedData) => void
}

export interface SavedData {
  favorites: string[]
  favoriteZones: string[]
  compare: string[]
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      zoneId: ALL_ZONE,
      favorites: [],
      favoriteZones: [],
      compare: [],
      alertsSeenAt: null,
      notify: false,
      markAlertsSeen: (alertsSeenAt) => set({ alertsSeenAt }),
      setNotify: (notify) => set({ notify }),
      setTheme: (theme) => set({ theme }),
      setZone: (zoneId) => set({ zoneId }),
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id],
        })),
      toggleFavoriteZone: (id) =>
        set((s) => ({
          favoriteZones: s.favoriteZones.includes(id)
            ? s.favoriteZones.filter((x) => x !== id)
            : [...s.favoriteZones, id],
        })),
      addCompare: (id) => {
        const cur = get().compare
        if (cur.includes(id)) return true
        if (cur.length >= MAX_COMPARE) return false
        set({ compare: [...cur, id] })
        return true
      },
      removeCompare: (id) => set((s) => ({ compare: s.compare.filter((x) => x !== id) })),
      setCompare: (ids) => set({ compare: [...new Set(ids)].slice(0, MAX_COMPARE) }),
      clearCompare: () => set({ compare: [] }),
      replaceSaved: (d) => set({ favorites: d.favorites, favoriteZones: d.favoriteZones, compare: d.compare }),
    }),
    {
      name: PREFS_KEY,
      version: 1,
      partialize: (s) => ({
        theme: s.theme,
        zoneId: s.zoneId,
        favorites: s.favorites,
        favoriteZones: s.favoriteZones,
        compare: s.compare,
        alertsSeenAt: s.alertsSeenAt,
        notify: s.notify,
      }),
    },
  ),
)

const EXPORT_APP = 'suncheon-zip'

export function exportSaved(s: SavedData, now: Date = new Date()): string {
  return JSON.stringify(
    {
      app: EXPORT_APP,
      version: 1,
      exportedAt: now.toISOString(),
      favorites: s.favorites,
      favoriteZones: s.favoriteZones,
      compare: s.compare,
    },
    null,
    2,
  )
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** 내보낸 JSON 문자열을 검증해 SavedData 로 변환. 형식이 다르면 Error. */
export function parseSaved(text: string): SavedData {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('JSON 형식이 아닙니다.')
  }
  const o = obj as Record<string, unknown>
  if (!o || o.app !== EXPORT_APP) throw new Error('순천집 ZIP 에서 내보낸 파일이 아닙니다.')
  if (!isStrArr(o.favorites)) throw new Error('관심 단지 목록이 올바르지 않습니다.')
  const zoneIds = new Set(ZONES.map((z) => z.id))
  return {
    favorites: [...new Set(o.favorites)],
    favoriteZones: isStrArr(o.favoriteZones) ? o.favoriteZones.filter((z) => zoneIds.has(z)) : [],
    compare: isStrArr(o.compare) ? [...new Set(o.compare)].slice(0, MAX_COMPARE) : [],
  }
}
