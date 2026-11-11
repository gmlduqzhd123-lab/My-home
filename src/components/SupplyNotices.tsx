import { ExternalLink } from 'lucide-react'
import { loadDevelopments, useResource } from '@/lib/data'
import { formatDate, formatDateTime } from '@/lib/format'
import { Badge } from './ui/primitives'
import { LoadingBlock, NotAvailable, PendingState } from './ui/states'

/** LH 분양·임대 공고 중 공고명에 '순천'이 들어간 공고 목록 */
export function SupplyNotices({ limit, compact }: { limit?: number; compact?: boolean }) {
  const res = useResource('developments', loadDevelopments)
  if (res.status === 'loading' || res.status === 'idle') return <LoadingBlock rows={2} />
  const f = res.status === 'ok' ? res.data : null
  if (!f || f.status === 'pending') {
    return (
      <PendingState title="LH 공고 연결 대기 중" className="py-6">
        공공데이터포털에서 ‘한국토지주택공사_분양임대공고문 조회 서비스’를 활용신청하면 다음 수집부터 순천 공고가 표시됩니다.
      </PendingState>
    )
  }
  if (f.status === 'failed' && f.items.length === 0) {
    return (
      <NotAvailable title="LH 공고 조회 실패" className="py-6">
        {f.message}
      </NotAvailable>
    )
  }
  if (f.items.length === 0) {
    return (
      <NotAvailable title="최근 2년간 순천 LH 공고가 없습니다" className="py-6">
        공고명에 ‘순천’이 들어간 공고 기준입니다.
      </NotAvailable>
    )
  }
  const items = limit ? f.items.slice(0, limit) : f.items
  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">{n.title}</p>
              <p className="num mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                {n.status && <Badge tone={n.status === '공고중' ? 'accent' : 'neutral'}>{n.status}</Badge>}
                {n.kind && <span>{n.kind}</span>}
                <span>
                  게시 {n.date ? formatDate(n.date) : '공고 확인 불가'}
                  {n.closeDate && ` · 마감 ${formatDate(n.closeDate)}`}
                </span>
              </p>
            </div>
            {n.url && (
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${n.title} 공고 원문 열기`}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-[13px] font-semibold text-accent-ink hover:bg-surface-2"
              >
                공고 <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
      {!compact && (
        <p className="num border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
          {f.status === 'failed' && `${f.message} 아래는 마지막으로 확인된 내용입니다. `}
          출처:{' '}
          <a href={f.source?.url ?? 'https://apply.lh.or.kr/'} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {f.source?.name ?? 'LH 청약플러스'}
          </a>
          {f.fetchedAt && ` · 조회 ${formatDateTime(f.fetchedAt)}`} · 공고명에 ‘순천’이 들어간 최근 2년 공고만 표시합니다. 자격·일정은 공고 원문으로
          확인하세요.
        </p>
      )}
    </div>
  )
}
