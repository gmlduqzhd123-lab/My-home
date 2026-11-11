import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { clearDataCache } from '@/lib/data'
import { usePrefs } from '@/store/prefs'
import { makeComplex, makeManifest, makeTrade, mockFetch } from '@/test/factory'
import type { Briefing } from '@/types'

const sep = [
  makeTrade({ id: 's1', complexId: 'c2', aptNm: '조례한빛', umdNm: '조례동', dealDate: '2026-09-10', price: 17000, area: 59.8, floor: 2 }),
  makeTrade({ id: 's2', complexId: 'c1', aptNm: '왕지하늘채', umdNm: '왕지동', dealDate: '2026-09-21', price: 40000, area: 84.97, floor: 9 }),
]
const oct = [
  makeTrade({ id: 'o1', complexId: 'c1', aptNm: '왕지하늘채', umdNm: '왕지동', dealDate: '2026-10-05', price: 41500, area: 84.97, floor: 12 }),
  makeTrade({ id: 'o2', complexId: 'c1', aptNm: '왕지하늘채', umdNm: '왕지동', dealDate: '2026-10-09', price: 30500, area: 59.98, floor: 4 }),
  makeTrade({ id: 'o3', complexId: 'c2', aptNm: '조례한빛', umdNm: '조례동', dealDate: '2026-10-12', price: 17800, area: 59.8, floor: 6 }),
  makeTrade({ id: 'o4', complexId: 'c2', aptNm: '조례한빛', umdNm: '조례동', dealDate: '2026-10-20', price: 99000, area: 59.8, floor: 8, cancelled: true, cancelDate: '2026-10-25' }),
]
const complexes = [
  makeComplex({ id: 'c1', name: '왕지하늘채', umdNm: '왕지동', address: '순천시 왕지동 1', lastPrice: 30500, areas: [60, 85], buildYear: 2016 }),
  makeComplex({ id: 'c2', name: '조례한빛', umdNm: '조례동', address: '순천시 조례동 2', lastPrice: 17800, areas: [60], buildYear: 2003 }),
]
const briefing: Briefing = {
  date: '2026-11-11', generatedAt: '2026-11-11T08:03:00+09:00', status: 'ok', message: null, previousDate: '2026-11-10',
  headlines: ['새로 확인된 매매 거래는 1건입니다.', '둘째 줄', '셋째 줄'], newTrades: [oct[0]], newTradesTotal: 1, newCancellations: [],
  corrections: [], zones: [], presales: [], checklist: ['확인 사항'], sources: [{ name: '국토교통부', url: 'https://www.data.go.kr/' }],
}
const okFiles = {
  'manifest.json': makeManifest(),
  'trades/2026-09.json': { ym: '2026-09', fetchedAt: '', source: '', trades: sep },
  'trades/2026-10.json': { ym: '2026-10', fetchedAt: '', source: '', trades: oct },
  'complexes.json': { generatedAt: '', complexes },
  'by-complex/c1.json': { complexId: 'c1', generatedAt: '', source: '', trades: [oct[0], oct[1], sep[1]] },
  'by-complex/c2.json': { complexId: 'c2', generatedAt: '', source: '', trades: [oct[2], oct[3], sep[0]] },
  'stats/summary.json': {
    generatedAt: '', months: [{ ym: '2026-09', count: 2, cancelled: 0, median: 28500 }, { ym: '2026-10', count: 3, cancelled: 1, median: 30500 }],
    byDong: { fromYm: '2026-09', toYm: '2026-10', rows: [] }, recentTrades: [...oct].reverse(),
  },
  'briefing/latest.json': briefing,
  'briefing/index.json': { items: [{ date: '2026-11-11', status: 'ok', newTradesTotal: 1 }] },
  'presales.json': { status: 'pending', fetchedAt: null, message: null, source: { name: '청약홈', url: 'https://www.applyhome.co.kr/' }, items: [] },
}

function open(path: string, files: Record<string, unknown> = okFiles) {
  vi.stubGlobal('fetch', mockFetch(files))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

// 표(데스크톱)와 카드(모바일)가 함께 렌더링되므로 표 안에서만 찾는다
const table = async () => within(await screen.findByRole('table', { name: '아파트 매매 실거래 목록' }))

beforeEach(() => {
  clearDataCache()
  usePrefs.setState({ favorites: [], favoriteZones: [], compare: [], zoneId: 'all', theme: 'light' })
})

describe('실거래 화면', () => {
  it('거래 목록과 요약을 보여 주고 해제 거래는 통계에서 뺀다', async () => {
    open('/trades')
    const t = await table()
    expect(t.getAllByRole('row')).toHaveLength(1 + 6)
    expect(t.getByText(/해제/)).toBeInTheDocument()
    expect(screen.getByText('5건')).toBeInTheDocument() // 해제 1건 제외
    expect(screen.getByText(/해제·미확인 1건은 통계에서 제외/)).toBeInTheDocument()
    expect(screen.getAllByText('4억 1,500만').length).toBeGreaterThan(0) // 최고가는 해제된 9억 9,000만이 아님
  })

  it('단지명·면적·금액 조건과 정렬이 동작한다', async () => {
    const user = userEvent.setup()
    open('/trades')
    await table()
    await user.type(screen.getByLabelText('단지명'), '왕지')
    expect((await table()).getAllByRole('row')).toHaveLength(1 + 3)

    await user.click(screen.getByRole('button', { name: /면적·금액·층 조건/ }))
    await user.type(screen.getByLabelText('전용면적 최소'), '80')
    expect((await table()).getAllByRole('row')).toHaveLength(1 + 2)
    await user.type(screen.getByLabelText('거래금액 최소'), '41000')
    expect((await table()).getAllByRole('row')).toHaveLength(1 + 1)

    await user.click(screen.getByRole('button', { name: /조건 초기화/ }))
    await user.selectOptions(screen.getByLabelText('정렬'), 'price_asc')
    const rows = (await table()).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('1억 7,000만')
  })

  it('거래기간을 바꾸면 해당 달만 조회한다', async () => {
    const user = userEvent.setup()
    open('/trades')
    await table()
    await user.selectOptions(screen.getByLabelText('시작 월'), '2026-10')
    await waitFor(async () => expect((await table()).getAllByRole('row')).toHaveLength(1 + 4))
  })

  it('생활권 필터', async () => {
    const user = userEvent.setup()
    open('/trades')
    await table()
    await user.selectOptions(screen.getByLabelText('생활권'), 'jorye')
    expect((await table()).getAllByRole('row')).toHaveLength(1 + 3)
    await user.selectOptions(screen.getByLabelText('생활권'), 'geumdang')
    expect(screen.getByText(/법정동 단위 자료로는 분리할 수 없습니다/)).toBeInTheDocument()
  })

  it('검색 결과가 없으면 안내한다', async () => {
    const user = userEvent.setup()
    open('/trades')
    await table()
    await user.type(screen.getByLabelText('단지명'), '없는단지이름')
    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument()
  })

  it('데이터가 아직 없으면 연결 대기를 안내하고 가격을 표시하지 않는다', async () => {
    open('/trades', { 'manifest.json': makeManifest({ status: 'pending', generatedAt: null, months: [], lastAttemptStatus: null }) })
    expect(await screen.findByText('데이터 연결 대기 중')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/공공데이터 연결 대기 중입니다/)).toBeInTheDocument()
  })

  it('API(네트워크) 오류를 안내한다', async () => {
    open('/trades', { ...okFiles, 'trades/2026-10.json': new TypeError('Failed to fetch') })
    expect(await screen.findByText('데이터를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('네트워크 오류')
  })

  it('최근 수집 실패 시 마지막 정상 자료임을 알린다', async () => {
    open('/trades', { ...okFiles, 'manifest.json': makeManifest({ lastAttemptStatus: 'failed' }) })
    expect(await screen.findByText(/마지막 정상 자료를 표시하고 있습니다/)).toBeInTheDocument()
    await table()
  })
})

describe('홈·브리핑', () => {
  it('대시보드에 지표·브리핑·갱신 시각을 표시한다', async () => {
    open('/')
    // 마지막 달(10월)은 신고가 진행 중이므로 대표 지표는 직전 달(9월) 기준
    expect(await screen.findByText('2026.09 계약 거래량')).toBeInTheDocument()
    expect(screen.getByText('2억 8,500만')).toBeInTheDocument()
    expect(screen.getByText('2026.10 계약(집계 중)')).toBeInTheDocument()
    expect(await screen.findByText('새로 확인된 매매 거래는 1건입니다.')).toBeInTheDocument()
    expect(screen.getByText(/최종 갱신 \d{4}\.\d{2}\.\d{2}/)).toBeInTheDocument()
    expect(await screen.findByText('분양정보 연결 대기 중')).toBeInTheDocument()
  })

  it('조회 실패 브리핑은 새 거래 없음과 구분한다', async () => {
    open('/briefing', { ...okFiles, 'briefing/latest.json': { ...briefing, status: 'failed', headlines: ['조회에 실패했습니다.'], newTrades: [], newTradesTotal: 0 } })
    expect((await screen.findAllByText('조회 실패')).length).toBeGreaterThan(0)
    expect(screen.queryByText('새로 확인된 거래 없음')).not.toBeInTheDocument()
  })
})

describe('단지 비교·관심', () => {
  it('단지를 추가·제거하면 비교 표가 바로 바뀐다', async () => {
    const user = userEvent.setup()
    open('/compare')
    expect(await screen.findByText('비교할 단지를 추가하세요')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/비교할 단지 검색/), '왕지')
    await user.click(await screen.findByRole('button', { name: /왕지하늘채/ }))
    const t = within(await screen.findByRole('table', { name: '단지 비교 표' }))
    expect(t.getByRole('columnheader', { name: /왕지하늘채/ })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/비교할 단지 검색/), '조례')
    await user.click(await screen.findByRole('button', { name: /조례한빛/ }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: '단지 비교 표' })).getAllByRole('columnheader')).toHaveLength(3))
    expect(screen.getByText('비교 조건 주의')).toBeInTheDocument() // 면적·연식이 다름
    expect(usePrefs.getState().compare).toEqual(['c1', 'c2'])

    await user.click(screen.getByRole('button', { name: '왕지하늘채 비교에서 빼기' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: '단지 비교 표' })).getAllByRole('columnheader')).toHaveLength(2))
  })

  it('단지 상세에서 관심 단지를 저장하면 관심 화면에 나타난다', async () => {
    const user = userEvent.setup()
    const view = open('/complex/c1')
    expect(await screen.findByRole('heading', { name: '왕지하늘채' })).toBeInTheDocument()
    expect(screen.getAllByText('자료 확인 불가').length).toBeGreaterThan(3) // K-apt 미연결 항목
    expect(screen.getByText('지도상 위치 확인 불가')).toBeInTheDocument() // 좌표를 만들지 않는다
    await user.click(screen.getByRole('button', { name: '왕지하늘채 관심 단지 추가' }))
    expect(usePrefs.getState().favorites).toEqual(['c1'])
    view.unmount()

    open('/favorites')
    expect(await screen.findByText('관심 단지 1곳')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: '아파트 매매 실거래 목록' })).toBeInTheDocument() // 브리핑의 새 거래
  })
})
