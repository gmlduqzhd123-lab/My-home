import type { Trade } from '@/types'

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** 통계 집계 대상 여부: 해제(취소)되지 않았고 최근 조회에서 확인된 거래 */
export function isActive(t: Trade): boolean {
  return !t.cancelled && !t.missingSince
}

export function activeTrades(trades: Trade[]): Trade[] {
  return trades.filter(isActive)
}

/** "유사 면적" 그룹 키: 전용면적을 1㎡ 단위로 반올림 (84.97 · 84.99 → 85) */
export function areaGroup(area: number): number {
  return Math.round(area)
}

export interface PriceSummary {
  count: number
  cancelled: number
  median: number | null
  min: Trade | null
  max: Trade | null
}

export function summarize(trades: Trade[]): PriceSummary {
  const act = activeTrades(trades)
  let min: Trade | null = null
  let max: Trade | null = null
  for (const t of act) {
    if (!min || t.price < min.price) min = t
    if (!max || t.price > max.price) max = t
  }
  return {
    count: act.length,
    cancelled: trades.length - act.length,
    median: median(act.map((t) => t.price)),
    min,
    max,
  }
}

export interface MonthlyPoint {
  ym: string
  count: number
  median: number | null
  min: number | null
  max: number | null
}

/** 월별(계약월) 거래량·중위가. yms 를 주면 거래 없는 달도 0건으로 채운다. */
export function monthlyAggregate(trades: Trade[], yms?: string[]): MonthlyPoint[] {
  const map = new Map<string, number[]>()
  for (const t of activeTrades(trades)) {
    const ym = t.dealDate.slice(0, 7)
    const arr = map.get(ym)
    if (arr) arr.push(t.price)
    else map.set(ym, [t.price])
  }
  const keys = yms ?? [...map.keys()].sort()
  return keys.map((ym) => {
    const prices = map.get(ym) ?? []
    return {
      ym,
      count: prices.length,
      median: median(prices),
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
    }
  })
}

export interface AreaGroupSummary {
  area: number
  count: number
  median: number | null
  last: Trade | null
}

export function byAreaGroup(trades: Trade[]): AreaGroupSummary[] {
  const map = new Map<number, Trade[]>()
  for (const t of activeTrades(trades)) {
    const k = areaGroup(t.area)
    const arr = map.get(k)
    if (arr) arr.push(t)
    else map.set(k, [t])
  }
  return [...map.entries()]
    .map(([area, list]) => ({
      area,
      count: list.length,
      median: median(list.map((t) => t.price)),
      last: [...list].sort(compareDateDesc)[0] ?? null,
    }))
    .sort((a, b) => a.area - b.area)
}

export function compareDateDesc(a: Trade, b: Trade): number {
  return a.dealDate < b.dealDate ? 1 : a.dealDate > b.dealDate ? -1 : b.price - a.price
}

export interface PrevComparison {
  prev: Trade
  diff: number // 만원
  pct: number
  floorDiffers: boolean
}

/**
 * 같은 단지·같은 면적 그룹의 "직전" 거래(해제 제외)와 비교.
 * 층이 다르면 floorDiffers 로 표시해 단순 가격 변동으로 오인하지 않게 한다.
 */
export function previousComparable(trade: Trade, complexTrades: Trade[]): PrevComparison | null {
  const g = areaGroup(trade.area)
  let prev: Trade | null = null
  for (const t of complexTrades) {
    if (!isActive(t) || t.id === trade.id || t.complexId !== trade.complexId) continue
    if (areaGroup(t.area) !== g || t.dealDate >= trade.dealDate) continue
    if (!prev || t.dealDate > prev.dealDate) prev = t
  }
  if (!prev) return null
  const diff = trade.price - prev.price
  return {
    prev,
    diff,
    pct: prev.price ? (diff / prev.price) * 100 : 0,
    floorDiffers: prev.floor !== trade.floor,
  }
}

/** 차트 텍스트 요약(스크린리더·차트 미표시 환경용) */
export function describeMonthly(points: MonthlyPoint[]): string {
  const withData = points.filter((p) => p.count > 0)
  if (withData.length === 0) return '선택한 조건에 해당하는 거래가 없습니다.'
  const total = withData.reduce((s, p) => s + p.count, 0)
  const peak = withData.reduce((a, b) => (b.count > a.count ? b : a))
  const first = withData[0]
  const last = withData[withData.length - 1]
  const fmt = (v: number | null) => (v == null ? '-' : `${v.toLocaleString('ko-KR')}만원`)
  return (
    `${first.ym}부터 ${last.ym}까지 해제 제외 ${total.toLocaleString('ko-KR')}건. ` +
    `거래가 가장 많았던 달은 ${peak.ym}(${peak.count}건). ` +
    `월 중위 거래금액은 첫 달 ${fmt(first.median)}, 마지막 달 ${fmt(last.median)}. ` +
    `월별 중위가는 거래된 단지·면적 구성이 달라 시장 전체 가격 변동을 뜻하지 않습니다.`
  )
}
