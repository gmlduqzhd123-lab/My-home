import type { Complex, Manifest, Trade } from '@/types'

/** 테스트용 가상 거래. 실제 거래가 아니다. */
let seq = 0
export function makeTrade(o: Partial<Trade> = {}): Trade {
  seq += 1
  return {
    id: `t${seq}`,
    complexId: 'c1',
    aptNm: '테스트단지',
    umdNm: '왕지동',
    jibun: '100',
    roadNm: null,
    dealDate: '2026-10-05',
    price: 30000,
    area: 84.97,
    floor: 7,
    buildYear: 2015,
    dealType: '중개거래',
    cancelled: false,
    cancelDate: null,
    rgstDate: null,
    aptDong: null,
    buyer: null,
    seller: null,
    agentLoc: null,
    landLease: false,
    firstSeenAt: '2026-11-10T08:00:00+09:00',
    missingSince: null,
    ...o,
  }
}

export function makeComplex(o: Partial<Complex> = {}): Complex {
  return {
    id: 'c1',
    name: '테스트단지',
    umdNm: '왕지동',
    jibun: '100',
    roadAddress: null,
    address: '순천시 왕지동 100',
    buildYear: 2015,
    lat: null,
    lng: null,
    coordSource: null,
    areas: [85],
    tradeCount: 3,
    cancelledCount: 0,
    lastDealDate: '2026-10-05',
    lastPrice: 30000,
    lastArea: 84.97,
    lastFloor: 7,
    kapt: null,
    ...o,
  }
}

export function makeManifest(o: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    status: 'ok',
    region: { name: '순천시', lawdCd: '12150' },
    generatedAt: new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
    lastAttemptStatus: 'ok',
    lastAttemptMessage: null,
    months: [
      { ym: '2026-09', count: 2, cancelled: 0, fetchedAt: '' },
      { ym: '2026-10', count: 3, cancelled: 1, fetchedAt: '' },
    ],
    totals: { trades: 5, cancelled: 1, complexes: 2, geocoded: 0 },
    sources: [],
    ...o,
  }
}

/** 경로 → JSON 맵으로 fetch 를 흉내 낸다. 없는 경로는 404, 값이 Error 면 네트워크 오류. */
export function mockFetch(files: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = Object.keys(files).find((k) => url.endsWith(`data/${k}`))
    if (!key) return new Response('not found', { status: 404 })
    const v = files[key]
    if (v instanceof Error) throw v
    return new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}
