import { useEffect, useState } from 'react'
import type {
  Briefing,
  BriefingIndex,
  ComplexFile,
  ComplexRentFile,
  ComplexesFile,
  DevelopmentsFile,
  Manifest,
  MonthFile,
  PresalesFile,
  PriceIndexFile,
  Rent,
  RentMonthFile,
  SchoolsFile,
  SummaryFile,
  Trade,
} from '@/types'

export type DataErrorKind = 'not_found' | 'network' | 'invalid'

export class DataError extends Error {
  kind: DataErrorKind
  constructor(kind: DataErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'DataError'
  }
}

export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`
}

const cache = new Map<string, Promise<unknown>>()

export function clearDataCache(): void {
  cache.clear()
}

async function fetchJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(dataUrl(path), { cache: 'no-cache' })
  } catch {
    throw new DataError('network', '네트워크 오류로 데이터를 불러오지 못했습니다.')
  }
  if (res.status === 404) throw new DataError('not_found', '데이터 파일이 아직 생성되지 않았습니다.')
  if (!res.ok) throw new DataError('network', `데이터 서버 응답 오류(${res.status})`)
  // 없는 파일에 HTML(SPA 대체 페이지)을 돌려주는 서버에서는 "파일 없음"으로 본다
  if (res.headers.get('content-type')?.includes('text/html')) {
    throw new DataError('not_found', '데이터 파일이 아직 생성되지 않았습니다.')
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new DataError('invalid', '데이터 형식이 올바르지 않습니다.')
  }
}

export function loadJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = fetchJson<T>(path)
    cache.set(path, p)
    p.catch(() => cache.delete(path)) // 실패는 캐시하지 않아 재시도 가능
  }
  return p
}

export const loadManifest = () => loadJson<Manifest>('manifest.json')
export const loadComplexes = () => loadJson<ComplexesFile>('complexes.json').then((f) => f.complexes)
export const loadSummary = () => loadJson<SummaryFile>('stats/summary.json')
export const loadMonth = (ym: string) => loadJson<MonthFile>(`trades/${ym}.json`)
export const loadComplexTrades = (id: string) =>
  loadJson<ComplexFile>(`by-complex/${encodeURIComponent(id)}.json`).then((f) => f.trades)
export const loadRentMonths = async (yms: string[]): Promise<Rent[]> =>
  (await Promise.all(yms.map((ym) => loadJson<RentMonthFile>(`rents/${ym}.json`)))).flatMap((f) => f.rents)
/** 단지별 전월세. 전월세 거래가 없는 단지는 파일이 없으므로 빈 목록으로 본다. */
export const loadComplexRents = (id: string): Promise<Rent[]> =>
  loadJson<ComplexRentFile>(`by-complex-rent/${encodeURIComponent(id)}.json`).then(
    (f) => f.rents,
    (e: unknown) => {
      if (e instanceof DataError && e.kind === 'not_found') return []
      throw e
    },
  )
export const loadBriefing = () => loadJson<Briefing>('briefing/latest.json')
export const loadBriefingIndex = () => loadJson<BriefingIndex>('briefing/index.json')
export const loadBriefingArchive = (date: string) => loadJson<Briefing>(`briefing/archive/${date}.json`)
export const loadPresales = () => loadJson<PresalesFile>('presales.json')
export const loadDevelopments = () => loadJson<DevelopmentsFile>('developments.json')
export const loadSchools = () => loadJson<SchoolsFile>('schools.json')
export const loadPriceIndex = () => loadJson<PriceIndexFile>('stats/price-index.json')

/** 필요한 달만 병렬 로드 */
export async function loadMonths(yms: string[]): Promise<Trade[]> {
  const files = await Promise.all(yms.map(loadMonth))
  return files.flatMap((f) => f.trades)
}

export type Resource<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: DataError }

/** key 가 바뀔 때마다 loader 를 실행한다. key=null 이면 idle. */
export function useResource<T>(key: string | null, loader: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{ key: string | null; res: Resource<T> }>({ key: null, res: { status: 'idle' } })

  useEffect(() => {
    if (key == null) return
    let alive = true
    loader().then(
      (data) => alive && setState({ key, res: { status: 'ok', data } }),
      (e: unknown) =>
        alive &&
        setState({
          key,
          res: {
            status: 'error',
            error: e instanceof DataError ? e : new DataError('invalid', '데이터 처리 중 오류가 발생했습니다.'),
          },
        }),
    )
    return () => {
      alive = false
    }
    // loader 는 key 로 식별한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (key == null) return { status: 'idle' }
  if (state.key !== key) return { status: 'loading' }
  return state.res
}

export const useManifest = () => useResource('manifest', loadManifest)
export const useComplexes = (enabled = true) => useResource(enabled ? 'complexes' : null, loadComplexes)
export const useSummary = (enabled = true) => useResource(enabled ? 'summary' : null, loadSummary)
export const useMonths = (yms: string[] | null) =>
  useResource(yms ? `months:${yms.join(',')}` : null, () => loadMonths(yms ?? []))
export const useComplexTrades = (id: string | null) =>
  useResource(id ? `complex:${id}` : null, () => loadComplexTrades(id ?? ''))

export type Freshness = 'pending' | 'fresh' | 'stale' | 'failed'

const STALE_MS = 36 * 60 * 60 * 1000 // 일 1회 갱신 + 예약 실행 지연 여유

/**
 * pending: 수집 이력 없음 / failed: 마지막 시도가 실패해 이전 정상 데이터를 표시 중 /
 * stale: 마지막 정상 갱신이 36시간 이상 지남 / fresh: 정상
 */
export function freshness(m: Manifest, now: number = Date.now()): Freshness {
  if (m.status === 'pending' || !m.generatedAt) return 'pending'
  if (m.lastAttemptStatus === 'failed') return 'failed'
  if (now - new Date(m.generatedAt).getTime() > STALE_MS) return 'stale'
  return 'fresh'
}

/** 매니페스트에 존재하는 달만 골라 반환(없는 달을 요청해 404 가 나지 않게) */
export function availableYms(m: Manifest, fromYm: string, toYm: string): string[] {
  return m.months.map((x) => x.ym).filter((ym) => ym >= fromYm && ym <= toYm).sort()
}
