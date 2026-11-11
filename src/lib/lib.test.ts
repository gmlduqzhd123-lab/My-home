import { describe, expect, it, vi } from 'vitest'
import { makeComplex, makeManifest, makeTrade } from '@/test/factory'
import { areaOptions, buildCompareRow, compareWarnings } from './compare'
import { availableYms, freshness, loadJson } from './data'
import { defaultTradeFilter, filterComplexes, filterTrades, emptyComplexFilter, matchesName, parseNum } from './filters'
import { formatDateTime, formatPrice, formatPriceShort, shiftYm, ymRange } from './format'
import { calcLoan } from './loan'
import { areaGroup, byAreaGroup, median, monthlyAggregate, previousComparable, summarize } from './stats'

const base = defaultTradeFilter('2026-01', '2026-12')

describe('format', () => {
  it('금액을 억·만 단위로 표기한다', () => {
    expect(formatPrice(32500)).toBe('3억 2,500만')
    expect(formatPrice(8500)).toBe('8,500만')
    expect(formatPrice(120000)).toBe('12억')
    expect(formatPrice(null)).toBe('확인 불가')
    expect(formatPriceShort(32000)).toBe('3.2억')
    expect(formatPriceShort(9000)).toBe('9,000만')
  })
  it('월 이동과 범위', () => {
    expect(shiftYm('2026-01', -1)).toBe('2025-12')
    expect(shiftYm('2026-11', 2)).toBe('2027-01')
    expect(ymRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
  it('시각은 한국시간으로 표시한다', () => {
    expect(formatDateTime('2026-11-10T23:05:00Z')).toBe('2026.11.11 08:05')
    expect(formatDateTime(null)).toBe('-')
  })
})

describe('거래 필터', () => {
  const trades = [
    makeTrade({ id: 'a', umdNm: '왕지동', aptNm: '왕지 하늘채', area: 84.97, price: 41000, floor: 12, dealDate: '2026-10-05' }),
    makeTrade({ id: 'b', umdNm: '조례동', aptNm: '조례한빛', area: 59.8, price: 17500, floor: 3, dealDate: '2026-09-20' }),
    makeTrade({ id: 'c', umdNm: '해룡면 신대리', aptNm: '신대누리', area: 84.95, price: 38000, floor: 20, dealDate: '2026-08-01' }),
    makeTrade({ id: 'd', umdNm: '연향동', aptNm: '연향새솔', area: 49.9, price: 11000, floor: null, dealDate: '2026-10-11', cancelled: true }),
  ]
  const ids = (f: Partial<typeof base>) => filterTrades(trades, { ...base, ...f }).map((t) => t.id)

  it('지역(생활권·법정동) 필터', () => {
    expect(ids({ zoneId: 'wangji' })).toEqual(['a'])
    expect(ids({ zoneId: 'sindae' })).toEqual(['c']) // 해룡면 신대리
    expect(ids({ zoneId: 'geumdang' }).sort()).toEqual(['b', 'd']) // 연향동+조례동(근사)
    expect(ids({ dong: '조례동' })).toEqual(['b'])
  })
  it('면적 필터', () => {
    expect(ids({ areaMin: 80 }).sort()).toEqual(['a', 'c'])
    expect(ids({ areaMax: 60 }).sort()).toEqual(['b', 'd'])
    expect(ids({ areaMin: 59, areaMax: 60 })).toEqual(['b'])
  })
  it('금액 필터', () => {
    expect(ids({ priceMin: 20000 }).sort()).toEqual(['a', 'c'])
    expect(ids({ priceMin: 15000, priceMax: 39000 }).sort()).toEqual(['b', 'c'])
  })
  it('층 필터는 층 정보가 없는 거래를 제외한다', () => {
    expect(ids({ floorMin: 1 }).sort()).toEqual(['a', 'b', 'c'])
    expect(ids({ floorMin: 10, floorMax: 15 })).toEqual(['a'])
  })
  it('거래기간 선택', () => {
    expect(ids({ fromYm: '2026-09', toYm: '2026-09' })).toEqual(['b'])
    expect(ids({ fromYm: '2026-10', toYm: '2026-12' }).sort()).toEqual(['a', 'd'])
  })
  it('단지명 검색은 공백을 무시한다', () => {
    expect(ids({ q: '왕지하늘' })).toEqual(['a'])
    expect(matchesName('왕지 롯데캐슬(1단지)', '롯데캐슬 1단지')).toBe(true)
  })
  it('해제 거래 숨기기', () => {
    expect(ids({ includeCancelled: false })).not.toContain('d')
  })
  it('정렬', () => {
    expect(ids({ sort: 'date_desc' })).toEqual(['d', 'a', 'b', 'c'])
    expect(ids({ sort: 'date_asc' })).toEqual(['c', 'b', 'a', 'd'])
    expect(ids({ sort: 'price_desc' })).toEqual(['a', 'c', 'b', 'd'])
    expect(ids({ sort: 'price_asc' })).toEqual(['d', 'b', 'c', 'a'])
    expect(ids({ sort: 'area_asc' })[0]).toBe('d')
  })
  it('검색 결과 없음', () => {
    expect(ids({ q: '없는단지' })).toEqual([])
  })
  it('숫자 입력 파싱', () => {
    expect(parseNum('32,500')).toBe(32500)
    expect(parseNum('')).toBeNull()
    expect(parseNum('abc')).toBeNull()
  })
})

describe('단지 필터', () => {
  const list = [
    makeComplex({ id: 'a', name: '가', umdNm: '왕지동', lastPrice: 41000, areas: [60, 85], buildYear: 2016 }),
    makeComplex({ id: 'b', name: '나', umdNm: '조례동', lastPrice: 17500, areas: [60], buildYear: 2003 }),
    makeComplex({ id: 'c', name: '다', umdNm: '덕암동', lastPrice: null, areas: [], buildYear: null }),
  ]
  const ids = (f: Partial<typeof emptyComplexFilter>) => filterComplexes(list, { ...emptyComplexFilter, ...f }).map((c) => c.id)
  it('지역·금액·면적·준공연도', () => {
    expect(ids({})).toEqual(['a', 'b', 'c'])
    expect(ids({ zoneId: 'jorye' })).toEqual(['b'])
    expect(ids({ priceMin: 30000 })).toEqual(['a']) // 거래 없는 단지는 금액 조건에서 제외
    expect(ids({ areaMin: 80 })).toEqual(['a'])
    expect(ids({ yearMin: 2010 })).toEqual(['a'])
    expect(ids({ q: '덕암' })).toEqual(['c'])
  })
})

describe('통계·차트 집계', () => {
  it('중위값', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([10, 20, 30, 41])).toBe(25)
  })
  it('해제·미확인 거래는 집계에서 제외한다', () => {
    const s = summarize([
      makeTrade({ price: 30000 }),
      makeTrade({ price: 99000, cancelled: true }),
      makeTrade({ price: 1000, missingSince: '2026-11-11T08:00:00+09:00' }),
      makeTrade({ price: 34000 }),
    ])
    expect(s.count).toBe(2)
    expect(s.cancelled).toBe(2)
    expect(s.median).toBe(32000)
    expect(s.max?.price).toBe(34000)
    expect(s.min?.price).toBe(30000)
  })
  it('월별 집계는 거래 없는 달을 0건으로 채운다', () => {
    const pts = monthlyAggregate(
      [makeTrade({ dealDate: '2026-08-03', price: 100 }), makeTrade({ dealDate: '2026-08-20', price: 300 }), makeTrade({ dealDate: '2026-10-01', price: 500 }), makeTrade({ dealDate: '2026-10-02', price: 900, cancelled: true })],
      ['2026-08', '2026-09', '2026-10'],
    )
    expect(pts.map((p) => p.count)).toEqual([2, 0, 1])
    expect(pts.map((p) => p.median)).toEqual([200, null, 500])
  })
  it('면적 그룹: 유사 면적을 묶고 다른 면적은 나눈다', () => {
    expect(areaGroup(84.97)).toBe(areaGroup(84.99))
    expect(areaGroup(59.98)).not.toBe(areaGroup(84.97))
    const g = byAreaGroup([makeTrade({ area: 84.97 }), makeTrade({ area: 84.6 }), makeTrade({ area: 59.9 })])
    expect(g.map((x) => [x.area, x.count])).toEqual([[60, 1], [85, 2]])
  })
  it('직전 거래 비교는 같은 단지·같은 면적만 대상으로 한다', () => {
    const cur = makeTrade({ id: 'cur', dealDate: '2026-10-05', price: 33000, area: 84.97, floor: 10 })
    const history = [
      cur,
      makeTrade({ dealDate: '2026-09-01', price: 20000, area: 59.9 }), // 다른 면적
      makeTrade({ dealDate: '2026-08-01', price: 31000, area: 84.99, floor: 3 }),
      makeTrade({ dealDate: '2026-09-15', price: 50000, area: 84.97, cancelled: true }), // 해제
      makeTrade({ dealDate: '2026-09-20', price: 10000, area: 84.97, complexId: 'other' }),
      makeTrade({ dealDate: '2026-11-01', price: 40000, area: 84.97 }), // 이후 거래
    ]
    const cmp = previousComparable(cur, history)
    expect(cmp?.prev.price).toBe(31000)
    expect(cmp?.diff).toBe(2000)
    expect(cmp?.floorDiffers).toBe(true)
    expect(previousComparable(makeTrade({ area: 114 }), history)).toBeNull()
  })
})

describe('단지 비교', () => {
  const yms = ['2026-09', '2026-10']
  const a = makeComplex({ id: 'a', name: '가단지', buildYear: 2018 })
  const b = makeComplex({ id: 'b', name: '나단지', buildYear: 2001 })
  const ta = [makeTrade({ complexId: 'a', area: 84.9, price: 40000, dealDate: '2026-10-03' }), makeTrade({ complexId: 'a', area: 84.9, price: 42000, dealDate: '2026-09-03' }), makeTrade({ complexId: 'a', area: 59.9, price: 30000, dealDate: '2026-09-09' }), makeTrade({ complexId: 'a', area: 84.9, price: 10000, dealDate: '2025-01-01' })]
  const tb = [makeTrade({ complexId: 'b', area: 59.8, price: 15000, dealDate: '2026-10-08' })]

  it('단지별 최다 거래 면적으로 요약한다', () => {
    const r = buildCompareRow(a, ta, '2026-09', '2026-10', 'top', yms)
    expect(r.area).toBe(85)
    expect(r.summary.count).toBe(2) // 기간 밖·다른 면적 제외
    expect(r.summary.median).toBe(41000)
    expect(r.last?.price).toBe(40000)
    expect(r.monthly.map((m) => m.count)).toEqual([1, 1])
  })
  it('같은 면적을 지정하면 해당 면적만 비교하고, 조건이 다르면 주의 문구를 낸다', () => {
    expect(areaOptions([ta, tb])).toEqual([60, 85])
    const same = [buildCompareRow(a, ta, '2026-09', '2026-10', 60, yms), buildCompareRow(b, tb, '2026-09', '2026-10', 60, yms)]
    expect(same.map((r) => r.summary.count)).toEqual([1, 1])
    const sameW = compareWarnings(same)
    expect(sameW.some((w) => w.includes('비교 면적이'))).toBe(false)
    expect(sameW.some((w) => w.includes('준공연도 차이가 17년'))).toBe(true)
    expect(sameW.some((w) => w.includes('3건 미만'))).toBe(true)

    const mixed = [buildCompareRow(a, ta, '2026-09', '2026-10', 'top', yms), buildCompareRow(b, tb, '2026-09', '2026-10', 'top', yms)]
    expect(compareWarnings(mixed)[0]).toContain('비교 면적이 단지마다 다릅니다')
    expect(compareWarnings([mixed[0]])).toEqual([])
  })
  it('기간 내 거래가 없으면 거래 없음으로 처리한다', () => {
    const r = buildCompareRow(b, tb, '2026-09', '2026-09', 'top', ['2026-09'])
    expect(r.area).toBeNull()
    expect(r.summary.count).toBe(0)
    expect(r.last).toBeNull()
  })
})

describe('대출 계산', () => {
  it('원리금균등', () => {
    const r = calcLoan({ price: 30000, cash: 10000, loan: 20000, ratePct: 4, years: 30, method: 'annuity' })
    expect(r.valid).toBe(true)
    expect(r.months).toBe(360)
    expect(r.firstPayment).toBeCloseTo(95.483, 2) // 약 954,830원
    expect(r.firstPayment).toBeCloseTo(r.lastPayment, 6)
    expect(r.totalInterest).toBeCloseTo(95.483 * 360 - 20000, 0)
    expect(r.schedule[359].balance).toBeCloseTo(0, 6)
    expect(r.requiredCash).toBe(10000)
    expect(r.cashGap).toBe(0)
  })
  it('원금균등', () => {
    const r = calcLoan({ price: 30000, cash: 5000, loan: 12000, ratePct: 6, years: 10, method: 'principal' })
    expect(r.schedule[0].principal).toBeCloseTo(100, 6)
    expect(r.firstPayment).toBeCloseTo(160, 6) // 100 + 12000×0.5%
    expect(r.lastPayment).toBeCloseTo(100.5, 6)
    expect(r.totalInterest).toBeCloseTo(3630, 6) // 0.5% × 100 × (120×121/2)
    expect(r.cashGap).toBe(-13000)
  })
  it('무이자와 잘못된 입력', () => {
    expect(calcLoan({ price: 10000, cash: 0, loan: 1200, ratePct: 0, years: 1, method: 'annuity' }).firstPayment).toBeCloseTo(100, 6)
    const bad = calcLoan({ price: 10000, cash: 0, loan: 20000, ratePct: 4, years: 0, method: 'annuity' })
    expect(bad.valid).toBe(false)
    expect(bad.errors.length).toBe(2)
  })
})

describe('데이터 상태', () => {
  const now = new Date('2026-11-11T09:00:00+09:00').getTime()
  it('연결 대기 / 정상 / 갱신 지연 / 조회 실패를 구분한다', () => {
    expect(freshness(makeManifest({ status: 'pending', generatedAt: null }), now)).toBe('pending')
    expect(freshness(makeManifest({ generatedAt: '2026-11-11T08:02:00+09:00' }), now)).toBe('fresh')
    expect(freshness(makeManifest({ generatedAt: '2026-11-09T08:00:00+09:00' }), now)).toBe('stale')
    expect(freshness(makeManifest({ generatedAt: '2026-11-10T08:00:00+09:00', lastAttemptStatus: 'failed' }), now)).toBe('failed')
  })
  it('없는 파일에 HTML 을 돌려주는 서버도 "파일 없음"으로 처리한다', async () => {
    vi.stubGlobal('fetch', async () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
    await expect(loadJson('briefing/none.json')).rejects.toMatchObject({ kind: 'not_found' })
    vi.unstubAllGlobals()
  })
  it('존재하는 달만 요청한다', () => {
    expect(availableYms(makeManifest(), '2026-01', '2026-09')).toEqual(['2026-09'])
  })
})
