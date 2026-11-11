import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasKakaoKey, loadKakao, type KPlace } from '@/lib/kakao'
import { Badge } from './ui/primitives'
import { LoadingBlock, NotAvailable } from './ui/states'

/** Kakao 로컬 카테고리 코드 */
const GROUPS = [
  { key: 'school', label: '학교', code: 'SC4', radius: 1500 },
  { key: 'hospital', label: '병원', code: 'HP8', radius: 1000 },
  { key: 'pharmacy', label: '약국', code: 'PM9', radius: 1000 },
  { key: 'mart', label: '대형마트', code: 'MT1', radius: 2000 },
  { key: 'store', label: '편의점', code: 'CS2', radius: 500 },
  { key: 'park', label: '공원', keyword: '공원', radius: 1000 },
  { key: 'bus', label: '버스정류장', keyword: '버스정류장', radius: 500 },
] as const

type Result = Record<string, KPlace[] | 'error'>

export const OFFICIAL_LINKS = [
  { name: '학구도안내서비스 (공식 통학구역 조회)', url: 'https://schoolzone.emac.kr/' },
  { name: '학교알리미 (학교 정보 공시)', url: 'https://www.schoolinfo.go.kr/' },
  { name: '전국초중등학교위치표준데이터 (공공데이터포털)', url: 'https://www.data.go.kr/data/15021148/standard.do' },
]

export function OfficialSchoolLinks() {
  return (
    <ul className="space-y-1.5">
      {OFFICIAL_LINKS.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink underline underline-offset-2">
            {l.name} <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  )
}

/** 단지 좌표 주변 시설(직선거리). Kakao 지도 키와 좌표가 모두 있을 때만 조회한다. */
export function NearbyPlaces({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [result, setResult] = useState<Result>({})
  const enabled = hasKakaoKey && lat != null && lng != null

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setState('loading')
    loadKakao().then(
      (kakao) => {
        const ps = new kakao.maps.services.Places()
        const loc = new kakao.maps.LatLng(lat!, lng!)
        const out: Result = {}
        let left = GROUPS.length
        const done = (key: string, data: KPlace[], status: string) => {
          const S = kakao.maps.services.Status
          out[key] = status === S.OK ? data.slice(0, 5) : status === S.ZERO_RESULT ? [] : 'error'
          if (--left === 0 && alive) {
            setResult(out)
            setState('ok')
          }
        }
        for (const g of GROUPS) {
          const opts = { location: loc, radius: g.radius, sort: kakao.maps.services.SortBy.DISTANCE, size: 5 }
          if ('code' in g) ps.categorySearch(g.code, (d, s) => done(g.key, d, s), opts)
          else ps.keywordSearch(g.keyword, (d, s) => done(g.key, d, s), opts)
        }
      },
      () => alive && setState('error'),
    )
    return () => {
      alive = false
    }
  }, [enabled, lat, lng])

  if (!enabled) {
    return (
      <NotAvailable title="주변 시설 자료 확인 불가" className="py-6">
        {lat == null ? '이 단지의 좌표가 확인되지 않아 주변 시설을 조회할 수 없습니다.' : 'Kakao 지도 키가 설정되지 않아 주변 시설을 조회할 수 없습니다.'}{' '}
        학교 배정은 아래 공식 사이트에서 확인하세요.
      </NotAvailable>
    )
  }
  if (state === 'loading' || state === 'idle') return <LoadingBlock rows={4} />
  if (state === 'error') {
    return (
      <NotAvailable title="주변 시설을 불러오지 못했습니다" className="py-6">
        Kakao 장소 검색 호출에 실패했습니다.
      </NotAvailable>
    )
  }
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
      {GROUPS.map((g) => {
        const r = result[g.key]
        return (
          <section key={g.key} className="rounded-xl bg-surface-2 p-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink">
              {g.label} <Badge>반경 {g.radius >= 1000 ? `${g.radius / 1000}km` : `${g.radius}m`}</Badge>
            </h3>
            {r === 'error' ? (
              <p className="text-[12px] text-muted">조회 실패</p>
            ) : !r || r.length === 0 ? (
              <p className="text-[12px] text-muted">반경 안에서 확인된 곳이 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {r.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <a href={p.place_url} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                      {p.place_name}
                    </a>
                    <span className="num shrink-0 text-[12px] text-muted">직선 {Number(p.distance).toLocaleString('ko-KR')}m</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
