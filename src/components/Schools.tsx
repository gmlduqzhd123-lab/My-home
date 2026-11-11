import { loadSchools, useResource } from '@/lib/data'
import { formatDateTime } from '@/lib/format'
import { nearest } from '@/lib/geo'
import type { SchoolsFile } from '@/types'
import { Badge } from './ui/primitives'
import { LoadingBlock, NotAvailable, PendingState } from './ui/states'

const KINDS = ['초등학교', '중학교', '고등학교']

function useSchools() {
  return useResource('schools', loadSchools)
}

function Unavailable({ f }: { f: SchoolsFile | null }) {
  return f?.status === 'failed' ? (
    <NotAvailable title="학교 위치 자료 조회 실패" className="py-6">
      {f.message}
    </NotAvailable>
  ) : (
    <PendingState title="학교 위치 자료 연결 대기 중" className="py-6">
      공공데이터포털에서 ‘전국초중등학교위치표준데이터’를 활용신청하면 다음 수집부터 표시됩니다.
    </PendingState>
  )
}

/** 단지 좌표에서 학교급별로 가까운 학교(직선거리). 배정 학교가 아니다. */
export function NearestSchools({ lat, lng }: { lat: number | null; lng: number | null }) {
  const res = useSchools()
  if (res.status === 'loading' || res.status === 'idle') return <LoadingBlock rows={3} />
  const f = res.status === 'ok' ? res.data : null
  if (!f || f.status !== 'ok' || f.items.length === 0) return <Unavailable f={f} />
  if (lat == null || lng == null) {
    return (
      <NotAvailable title="거리 계산 불가" className="py-6">
        이 단지의 좌표가 확인되지 않아 학교까지의 거리를 계산할 수 없습니다.
      </NotAvailable>
    )
  }
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
      {KINDS.map((kind) => {
        const list = nearest(lat, lng, f.items.filter((s) => s.kind === kind), 3)
        return (
          <section key={kind} className="rounded-xl bg-surface-2 p-3">
            <h3 className="mb-1.5 text-[13px] font-bold text-ink">{kind}</h3>
            {list.length === 0 ? (
              <p className="text-[12px] text-muted">좌표가 확인된 학교가 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {list.map(({ item, meters }) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate text-ink">{item.name}</span>
                    <span className="num shrink-0 text-[12px] text-muted">직선 {meters.toLocaleString('ko-KR')}m</span>
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

/** 순천시 학교 목록(학교급별) */
export function SchoolList() {
  const res = useSchools()
  if (res.status === 'loading' || res.status === 'idle') return <LoadingBlock rows={4} />
  const f = res.status === 'ok' ? res.data : null
  if (!f || f.status !== 'ok' || f.items.length === 0) return <Unavailable f={f} />
  const kinds = [...KINDS, ...new Set(f.items.map((s) => s.kind).filter((k) => !KINDS.includes(k)))]
  return (
    <div className="space-y-4 p-4 sm:p-5">
      {kinds.map((kind) => {
        const list = f.items.filter((s) => s.kind === kind)
        if (list.length === 0) return null
        return (
          <section key={kind}>
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-ink">
              {kind} <Badge>{list.length}곳</Badge>
            </h3>
            <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {list.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-2 border-b border-line/60 py-1 text-[13px]">
                  <span className="shrink-0 font-semibold text-ink">{s.name}</span>
                  <span className="truncate text-[12px] text-muted">{s.address.replace(/^.*순천시\s*/, '')}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="num text-[12px] text-muted">
        출처:{' '}
        <a href={f.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {f.source.name}
        </a>{' '}
        · 조회 {formatDateTime(f.fetchedAt)}
      </p>
    </div>
  )
}
