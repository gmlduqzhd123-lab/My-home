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
  /** 직거래(중개사 없이 당사자 간 거래) 제외 */
  excludeDirect: boolean
  /** 매도자 또는 매수자가 법인인 거래 제외 */
  excludeCorp: boolean
  sort: TradeSort
}

export function isDirect(t: Trade): boolean {
  return t.dealType === '직거래'
}

export function isCorp(t: Trade): boolean {
  return t.buyer === '법인' || t.seller === '법인'
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
    excludeDirect: false,
    excludeCorp: false,
    sort: 'date_desc',
  }
}

const SORTS: TradeSort[] = ['date_desc', 'date_asc', 'price_desc', 'price_asc', 'area_desc', 'area_asc']
const NUM_KEYS = [
  ['amin', 'areaMin'],
  ['amax', 'areaMax'],
  ['pmin', 'priceMin'],
  ['pmax', 'priceMax'],
  ['fmin', 'floorMin'],
  ['fmax', 'floorMax'],
] as const

/** 검색 조건 → 주소 쿼리. 기본값과 같은 항목은 생략해 주소를 짧게 유지한다. */
export function filterToParams(f: TradeFilter, base: TradeFilter): URLSearchParams {
  const p = new URLSearchParams()
  if (f.fromYm !== base.fromYm) p.set('from', f.fromYm)
  if (f.toYm !== base.toYm) p.set('to', f.toYm)
  if (f.zoneId !== ALL_ZONE) p.set('zone', f.zoneId)
  if (f.dong) p.set('dong', f.dong)
  if (f.q.trim()) p.set('q', f.q.trim())
  for (const [k, key] of NUM_KEYS) if (f[key] != null) p.set(k, String(f[key]))
  if (!f.includeCancelled) p.set('cancel', '0')
  if (f.excludeDirect) p.set('direct', '0')
  if (f.excludeCorp) p.set('corp', '0')
  if (f.sort !== base.sort) p.set('sort', f.sort)
  return p
}

/** 주소 쿼리 → 검색 조건. 잘못된 값은 무시하고 기본값을 쓴다. */
export function paramsToFilter(p: URLSearchParams, base: TradeFilter, validYms: string[]): TradeFilter {
  const ym = (v: string | null, d: string) => (v && validYms.includes(v) ? v : d)
  let fromYm = ym(p.get('from'), base.fromYm)
  let toYm = ym(p.get('to'), base.toYm)
  if (fromYm > toYm) [fromYm, toYm] = [toYm, fromYm]
  const sort = p.get('sort') as TradeSort | null
  const f: TradeFilter = {
    ...base,
    fromYm,
    toYm,
    zoneId: p.get('zone') ?? base.zoneId,
    dong: p.get('dong') ?? '',
    q: p.get('q') ?? '',
    includeCancelled: p.get('cancel') !== '0',
    excludeDirect: p.get('direct') === '0',
    excludeCorp: p.get('corp') === '0',
    sort: sort && SORTS.includes(sort) ? sort : base.sort,
  }
  for (const [k, key] of NUM_KEYS) f[key] = parseNum(p.get(k) ?? '')
  return f
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
    if (f.excludeDirect && isDirect(t)) return false
    if (f.excludeCorp && isCorp(t)) return false
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
