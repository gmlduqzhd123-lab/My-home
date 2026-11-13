import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchNearby, PLACE_GROUPS, type PlaceResult } from '@/lib/overpass'
import { Badge } from './ui/primitives'
import { LoadingBlock, NotAvailable } from './ui/states'

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

/** 단지 좌표 주변 시설(직선거리). OpenStreetMap(Overpass API)으로 조회하며 좌표가 있을 때만 동작한다. */
export function NearbyPlaces({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [result, setResult] = useState<PlaceResult>({})
  const enabled = lat != null && lng != null

  useEffect(() => {
    if (lat == null || lng == null) return
    let alive = true
    setState('loading')
    fetchNearby(lat, lng).then(
      (r) => {
        if (!alive) return
        setResult(r)
        setState('ok')
      },
      () => alive && setState('error'),
    )
    return () => {
      alive = false
    }
  }, [lat, lng])

  if (!enabled) {
    return (
      <NotAvailable title="주변 시설 자료 확인 불가" className="py-6">
        이 단지의 좌표가 확인되지 않아 주변 시설을 조회할 수 없습니다. 학교 배정은 아래 공식 사이트에서 확인하세요.
      </NotAvailable>
    )
  }
  if (state === 'loading') return <LoadingBlock rows={4} />
  if (state === 'error') {
    return (
      <NotAvailable title="주변 시설을 불러오지 못했습니다" className="py-6">
        OpenStreetMap 시설 조회 서버가 응답하지 않았습니다. 잠시 뒤 다시 열어 주세요.
      </NotAvailable>
    )
  }
  return (
    <div className="p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {PLACE_GROUPS.map((g) => {
          const r = result[g.key] ?? []
          return (
            <section key={g.key} className="rounded-xl bg-surface-2 p-3">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink">
                {g.label} <Badge>반경 {g.radius >= 1000 ? `${g.radius / 1000}km` : `${g.radius}m`}</Badge>
              </h3>
              {r.length === 0 ? (
                <p className="text-[12px] text-muted">반경 안에서 확인된 곳이 없습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {r.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <a href={p.url} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                        {p.name}
                      </a>
                      <span className="num shrink-0 text-[12px] text-muted">직선 {p.distance.toLocaleString('ko-KR')}m</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        시설 자료: ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          OpenStreetMap
        </a>{' '}
        기여자. 누구나 편집하는 지도라 빠지거나 바뀐 곳이 있을 수 있습니다.
      </p>
    </div>
  )
}
