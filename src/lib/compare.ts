import type { Complex, Trade } from '@/types'
import { areaGroup, byAreaGroup, compareDateDesc, isActive, monthlyAggregate, summarize, type MonthlyPoint, type PriceSummary } from './stats'

/** 'top' = 단지마다 기간 내 거래가 가장 많은 면적 */
export type AreaMode = 'top' | number

export interface CompareRow {
  complex: Complex
  /** 실제 비교에 쓰인 면적 그룹(㎡). 기간 내 거래가 없으면 null */
  area: number | null
  summary: PriceSummary
  last: Trade | null
  monthly: MonthlyPoint[]
}

export function buildCompareRow(complex: Complex, trades: Trade[], fromYm: string, toYm: string, mode: AreaMode, yms: string[]): CompareRow {
  const inPeriod = trades.filter((t) => {
    const ym = t.dealDate.slice(0, 7)
    return ym >= fromYm && ym <= toYm
  })
  let area: number | null
  if (mode === 'top') {
    const groups = byAreaGroup(inPeriod)
    area = groups.length ? [...groups].sort((a, b) => b.count - a.count || a.area - b.area)[0].area : null
  } else {
    area = mode
  }
  const scoped = area == null ? [] : inPeriod.filter((t) => areaGroup(t.area) === area)
  const active = scoped.filter(isActive).sort(compareDateDesc)
  return {
    complex,
    area: active.length ? area : mode === 'top' ? null : area,
    summary: summarize(scoped),
    last: active[0] ?? null,
    monthly: monthlyAggregate(scoped, yms),
  }
}

/** 선택된 단지들의 면적 그룹 합집합(비교 면적 선택지) */
export function areaOptions(tradeLists: Trade[][]): number[] {
  const s = new Set<number>()
  for (const list of tradeLists) for (const t of list) if (isActive(t)) s.add(areaGroup(t.area))
  return [...s].sort((a, b) => a - b)
}

/** 비교 조건이 서로 달라 해석에 주의가 필요한 경우의 안내 문구 */
export function compareWarnings(rows: CompareRow[]): string[] {
  const out: string[] = []
  if (rows.length < 2) return out
  const areas = rows.map((r) => r.area).filter((a): a is number => a != null)
  if (areas.length >= 2 && Math.max(...areas) - Math.min(...areas) >= 3) {
    out.push(`비교 면적이 단지마다 다릅니다(${areas.map((a) => `${a}㎡`).join(', ')}). 금액을 그대로 비교하지 말고 같은 면적을 선택해 보세요.`)
  }
  const years = rows.map((r) => r.complex.buildYear).filter((y): y is number => y != null)
  if (years.length >= 2 && Math.max(...years) - Math.min(...years) >= 10) {
    out.push(`준공연도 차이가 ${Math.max(...years) - Math.min(...years)}년입니다. 연식에 따른 차이가 금액에 반영되어 있습니다.`)
  }
  const thin = rows.filter((r) => r.summary.count > 0 && r.summary.count < 3)
  if (thin.length) out.push(`거래 표본이 3건 미만인 단지가 있습니다(${thin.map((r) => r.complex.name).join(', ')}). 중위값이 한두 건의 거래에 좌우됩니다.`)
  const none = rows.filter((r) => r.summary.count === 0)
  if (none.length) out.push(`선택한 기간·면적에 거래가 없는 단지가 있습니다(${none.map((r) => r.complex.name).join(', ')}).`)
  return out
}
