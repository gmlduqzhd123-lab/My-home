import { describe, expect, it } from 'vitest'
import { makeTrade } from '@/test/factory'
import type { Rent } from '@/types'
import { defaultTradeFilter, filterToParams, filterTrades, paramsToFilter } from './filters'
import { distanceM, nearest } from './geo'
import { filterRents, rentMonthly, summarizeRents, type RentFilter } from './rent'

const base = defaultTradeFilter('2025-12', '2026-11')
const yms = ['2025-12', '2026-01', '2026-10', '2026-11']

describe('직거래·법인 거래 제외', () => {
  const trades = [
    makeTrade({ id: 'n', dealDate: '2026-10-01' }),
    makeTrade({ id: 'd', dealDate: '2026-10-02', dealType: '직거래' }),
    makeTrade({ id: 'c', dealDate: '2026-10-03', seller: '법인', buyer: '개인' }),
    makeTrade({ id: 'b', dealDate: '2026-10-04', dealType: '직거래', buyer: '법인' }),
  ]
  const ids = (f: Partial<typeof base>) => filterTrades(trades, { ...base, ...f }).map((t) => t.id).sort()
  it('옵션별로 걸러 낸다', () => {
    expect(ids({})).toEqual(['b', 'c', 'd', 'n'])
    expect(ids({ excludeDirect: true })).toEqual(['c', 'n'])
    expect(ids({ excludeCorp: true })).toEqual(['d', 'n'])
    expect(ids({ excludeDirect: true, excludeCorp: true })).toEqual(['n'])
  })
})

describe('검색 조건 주소 저장', () => {
  it('기본값은 주소에 남기지 않는다', () => {
    expect(filterToParams(base, base).toString()).toBe('')
  })
  it('조건을 주소로 만들고 그대로 복원한다', () => {
    const f = { ...base, fromYm: '2026-01', zoneId: 'sindae', dong: '해룡면 신대리', q: '중흥 6단지', areaMin: 59, priceMax: 40000, floorMin: 5, includeCancelled: false, excludeDirect: true, excludeCorp: true, sort: 'price_desc' as const }
    const p = filterToParams(f, base)
    expect(p.get('q')).toBe('중흥 6단지')
    expect(p.get('direct')).toBe('0')
    expect(paramsToFilter(new URLSearchParams(p.toString()), base, yms)).toEqual(f)
  })
  it('잘못된 값은 무시한다', () => {
    const f = paramsToFilter(new URLSearchParams('from=1999-01&to=abc&sort=hack&amin=x&pmin=30000'), base, yms)
    expect([f.fromYm, f.toYm, f.sort, f.areaMin, f.priceMin]).toEqual(['2025-12', '2026-11', 'date_desc', null, 30000])
  })
  it('시작 월이 끝 월보다 늦으면 바꿔 준다', () => {
    const f = paramsToFilter(new URLSearchParams('from=2026-10&to=2026-01'), base, yms)
    expect([f.fromYm, f.toYm]).toEqual(['2026-01', '2026-10'])
  })
})

let n = 0
function rent(o: Partial<Rent>): Rent {
  n += 1
  return {
    id: `r${n}`, complexId: 'c1', aptNm: '테스트단지', umdNm: '왕지동', jibun: '1', dealDate: '2026-10-05', deposit: 20000, monthly: 0,
    area: 84.9, floor: 5, buildYear: 2015, contractType: '신규', contractTerm: null, useRenewal: null, prevDeposit: null, prevMonthly: null,
    firstSeenAt: '', missingSince: null, ...o,
  }
}

describe('전월세', () => {
  const rents = [
    rent({ id: 'j1', deposit: 20000 }),
    rent({ id: 'j2', deposit: 24000, dealDate: '2026-11-02', contractType: '갱신', prevDeposit: 22000 }),
    rent({ id: 'w1', deposit: 3000, monthly: 60, umdNm: '조례동', area: 59.8 }),
    rent({ id: 'w2', deposit: 1000, monthly: 80, dealDate: '2026-09-20' }),
    rent({ id: 'x', deposit: 99999, missingSince: '2026-11-11' }),
  ]
  const f: RentFilter = { fromYm: '2026-10', toYm: '2026-11', zoneId: 'all', dong: '', q: '', kind: 'all', areaMin: null, areaMax: null, newOnly: false }
  const ids = (p: Partial<RentFilter>) => filterRents(rents, { ...f, ...p }).map((r) => r.id)

  it('기간·종류·지역·면적·갱신 여부로 거른다', () => {
    expect(ids({})).toEqual(['j2', 'x', 'j1', 'w1'])
    expect(ids({ kind: 'jeonse' })).toEqual(['j2', 'x', 'j1'])
    expect(ids({ kind: 'wolse' })).toEqual(['w1'])
    expect(ids({ zoneId: 'jorye' })).toEqual(['w1'])
    expect(ids({ areaMin: 80 })).toEqual(['j2', 'x', 'j1'])
    expect(ids({ newOnly: true })).not.toContain('j2')
  })
  it('요약은 전세·월세를 나누고 미확인 거래를 뺀다', () => {
    const s = summarizeRents(filterRents(rents, f))
    expect([s.count, s.jeonse, s.wolse, s.renewals]).toEqual([3, 2, 1, 1])
    expect(s.medianJeonse).toBe(22000) // 99999(미확인)는 제외
    expect(s.medianMonthly).toBe(60)
  })
  it('월별 집계', () => {
    expect(rentMonthly(rents, ['2026-09', '2026-10', '2026-11'])).toEqual([
      { ym: '2026-09', jeonse: 0, wolse: 1, medianJeonse: null },
      { ym: '2026-10', jeonse: 1, wolse: 1, medianJeonse: 20000 },
      { ym: '2026-11', jeonse: 1, wolse: 0, medianJeonse: 24000 },
    ])
  })
})

describe('거리 계산', () => {
  it('직선거리(하버사인)', () => {
    expect(distanceM(34.95, 127.5, 34.95, 127.5)).toBe(0)
    const d = distanceM(34.95, 127.5, 34.96, 127.5) // 위도 0.01도 ≈ 1.11km
    expect(d).toBeGreaterThan(1100)
    expect(d).toBeLessThan(1120)
  })
  it('가까운 순서로 고르고 좌표 없는 항목은 뺀다', () => {
    const items = [
      { id: 'far', lat: 35.0, lng: 127.5 },
      { id: 'none', lat: null, lng: null },
      { id: 'near', lat: 34.951, lng: 127.5 },
    ]
    expect(nearest(34.95, 127.5, items, 5).map((x) => x.item.id)).toEqual(['near', 'far'])
  })
})
