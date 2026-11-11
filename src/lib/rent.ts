import { inZone } from '@/config/zones'
import type { Rent } from '@/types'
import { matchesName } from './filters'
import { median } from './stats'

export type RentKind = 'all' | 'jeonse' | 'wolse'

export interface RentFilter {
  fromYm: string
  toYm: string
  zoneId: string
  dong: string
  q: string
  kind: RentKind
  areaMin: number | null
  areaMax: number | null
  /** 갱신 계약 제외(신규 계약만) */
  newOnly: boolean
}

export const isJeonse = (r: Rent) => r.monthly === 0
const visible = (r: Rent) => !r.missingSince

export function filterRents(rents: Rent[], f: RentFilter): Rent[] {
  return rents
    .filter((r) => {
      const ym = r.dealDate.slice(0, 7)
      if (ym < f.fromYm || ym > f.toYm) return false
      if (!inZone(r.umdNm, f.zoneId)) return false
      if (f.dong && r.umdNm !== f.dong) return false
      if (!matchesName(r.aptNm, f.q)) return false
      if (f.kind === 'jeonse' && !isJeonse(r)) return false
      if (f.kind === 'wolse' && isJeonse(r)) return false
      if (f.areaMin != null && r.area < f.areaMin) return false
      if (f.areaMax != null && r.area > f.areaMax) return false
      if (f.newOnly && r.contractType === '갱신') return false
      return true
    })
    .sort((a, b) => (a.dealDate < b.dealDate ? 1 : a.dealDate > b.dealDate ? -1 : b.deposit - a.deposit))
}

export interface RentSummary {
  count: number
  jeonse: number
  wolse: number
  medianJeonse: number | null
  /** 월세 계약의 월세 중위값(보증금 수준은 제각각이라 참고용) */
  medianMonthly: number | null
  renewals: number
}

export function summarizeRents(rents: Rent[]): RentSummary {
  const act = rents.filter(visible)
  const j = act.filter(isJeonse)
  const w = act.filter((r) => !isJeonse(r))
  return {
    count: act.length,
    jeonse: j.length,
    wolse: w.length,
    medianJeonse: median(j.map((r) => r.deposit)),
    medianMonthly: median(w.map((r) => r.monthly)),
    renewals: act.filter((r) => r.contractType === '갱신').length,
  }
}

export interface RentMonthlyPoint {
  ym: string
  jeonse: number
  wolse: number
  medianJeonse: number | null
}

export function rentMonthly(rents: Rent[], yms: string[]): RentMonthlyPoint[] {
  const map = new Map<string, Rent[]>()
  for (const r of rents.filter(visible)) {
    const ym = r.dealDate.slice(0, 7)
    const a = map.get(ym)
    if (a) a.push(r)
    else map.set(ym, [r])
  }
  return yms.map((ym) => {
    const list = map.get(ym) ?? []
    const j = list.filter(isJeonse)
    return { ym, jeonse: j.length, wolse: list.length - j.length, medianJeonse: median(j.map((r) => r.deposit)) }
  })
}
