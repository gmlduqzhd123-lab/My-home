import { ALL_ZONE, inZone } from '@/config/zones'
import type { Complex, Trade } from '@/types'
import { areaGroup } from './stats'

export type TradeSort = 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc' | 'area_desc' | 'area_asc'

export interface TradeFilter {
  fromYm: string
  toYm: string
  zoneId: string
  dong: string // '' = 전체 법정동
  q: string // 단지명 검색
  areaMin: number | null
  areaMax: number | null
  priceMin: number | null // 만원
  priceMax: number | null
  floorMin: number | null
  floorMax: number | null
  includeCancelled: boolean
  sort: TradeSort
}

export function defaultTradeFilter(fromYm: string, toYm: string): TradeFilter {
  return {
    fromYm,
    toYm,
    zoneId: ALL_ZONE,
    dong: '',
    q: '',
    areaMin: null,
    areaMax: null,
    priceMin: null,
    priceMax: null,
    floorMin: null,
    floorMax: null,
    includeCancelled: true,
    sort: 'date_desc',
  }
}

/** 검색어 정규화: 공백·괄호·특수문자 제거, 소문자 */
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[\s()[\]·.,-]/g, '')
}

export function matchesName(name: string, q: string): boolean {
  const nq = normalizeQuery(q)
  return nq === '' || normalizeQuery(name).includes(nq)
}

function inRange(v: number | null, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true
  if (v == null) return false
  if (min != null && v < min) return false
  if (max != null && v > max) return false
  return true
}

export function filterTrades(trades: Trade[], f: TradeFilter): Trade[] {
  const out = trades.filter((t) => {
    const ym = t.dealDate.slice(0, 7)
    if (ym < f.fromYm || ym > f.toYm) return false
    if (!f.includeCancelled && (t.cancelled || t.missingSince)) return false
    if (!inZone(t.umdNm, f.zoneId)) return false
    if (f.dong && t.umdNm !== f.dong) return false
    if (!matchesName(t.aptNm, f.q)) return false
    if (!inRange(t.area, f.areaMin, f.areaMax)) return false
    if (!inRange(t.price, f.priceMin, f.priceMax)) return false
    if (!inRange(t.floor, f.floorMin, f.floorMax)) return false
    return true
  })
  return sortTrades(out, f.sort)
}

export function sortTrades(trades: Trade[], sort: TradeSort): Trade[] {
  const s = [...trades]
  const byDate = (a: Trade, b: Trade) => (a.dealDate < b.dealDate ? -1 : a.dealDate > b.dealDate ? 1 : 0)
  switch (sort) {
    case 'date_desc':
      return s.sort((a, b) => byDate(b, a) || b.price - a.price)
    case 'date_asc':
      return s.sort((a, b) => byDate(a, b) || a.price - b.price)
    case 'price_desc':
      return s.sort((a, b) => b.price - a.price || byDate(b, a))
    case 'price_asc':
      return s.sort((a, b) => a.price - b.price || byDate(b, a))
    case 'area_desc':
      return s.sort((a, b) => b.area - a.area || byDate(b, a))
    case 'area_asc':
      return s.sort((a, b) => a.area - b.area || byDate(b, a))
  }
}

export interface ComplexFilter {
  zoneId: string
  q: string
  priceMin: number | null // 최근 거래금액(만원)
  priceMax: number | null
  areaMin: number | null
  areaMax: number | null
  yearMin: number | null
  yearMax: number | null
}

export const emptyComplexFilter: ComplexFilter = {
  zoneId: ALL_ZONE,
  q: '',
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  yearMin: null,
  yearMax: null,
}

export function filterComplexes(list: Complex[], f: ComplexFilter): Complex[] {
  return list.filter((c) => {
    if (!inZone(c.umdNm, f.zoneId)) return false
    if (!matchesName(`${c.name}${c.umdNm}`, f.q)) return false
    if (!inRange(c.lastPrice, f.priceMin, f.priceMax)) return false
    if (!inRange(c.buildYear, f.yearMin, f.yearMax)) return false
    if (f.areaMin != null || f.areaMax != null) {
      // 단지가 보유한 면적 그룹 중 하나라도 범위에 들면 통과
      if (!c.areas.some((a) => inRange(a, f.areaMin, f.areaMax))) return false
    }
    return true
  })
}

export function distinctDongs(items: { umdNm: string }[]): string[] {
  return [...new Set(items.map((i) => i.umdNm))].sort((a, b) => a.localeCompare(b, 'ko'))
}

export function distinctAreaGroups(trades: Trade[]): number[] {
  return [...new Set(trades.map((t) => areaGroup(t.area)))].sort((a, b) => a - b)
}

/** 입력 문자열 → 숫자(빈 값·잘못된 값은 null) */
export function parseNum(s: string): number | null {
  const t = s.replace(/,/g, '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
