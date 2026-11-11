import { loadSupply, useResource } from '@/lib/data'
import { formatDate, formatDateTime } from '@/lib/format'
import { Badge } from './ui/primitives'
import { LoadingBlock, NotAvailable, PendingState } from './ui/states'

/** 순천시 주택 인허가 사업 목록(건축HUB 주택인허가정보) — 앞으로 공급될 가능성이 있는 사업 */
export function PermitList({ limit }: { limit?: number }) {
  const res = useResource('supply', loadSupply)
  if (res.status === 'loading' || res.status === 'idle') return <LoadingBlock rows={3} />
  const f = res.status === 'ok' ? res.data : null
  if (!f || f.status === 'pending') {
    return (
      <PendingState title="주택 인허가 정보 연결 대기 중" className="py-6">
        공공데이터포털에서 ‘국토교통부_건축HUB_주택인허가정보 서비스’를 활용신청하면 다음 수집부터 표시됩니다.
      </PendingState>
    )
  }
  if (f.status === 'failed' && f.items.length === 0) {
    return (
      <NotAvailable title="주택 인허가 정보 조회 실패" className="py-6">
        {f.message}
      </NotAvailable>
    )
  }
  const partial = f.coverage && f.coverage.done < f.coverage.total
  const items = limit ? f.items.slice(0, limit) : f.items
  return (
    <div>
      {items.length === 0 ? (
        <NotAvailable title="최근 6년간 20세대 이상 주택 인허가가 없습니다" className="py-6">
          {partial ? '아직 조회하지 않은 법정동이 있습니다.' : '조회한 법정동 기준입니다.'}
        </NotAvailable>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="가로로 스크롤할 수 있는 표">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">순천시 주택 인허가 사업 목록</caption>
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">사업 · 대지위치</th>
                <th scope="col" className="px-2 py-2.5 text-right font-semibold">세대수</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">허가일</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">착공</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">단계</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="block font-semibold text-ink">{p.name ?? '건물명 미기재'}</span>
                    <span className="block text-[12px] text-muted">{p.address.replace(/^.*순천시\s*/, '순천시 ')}</span>
                  </td>
                  <td className="num px-2 py-2.5 text-right whitespace-nowrap">{p.households != null ? `${p.households.toLocaleString('ko-KR')}세대` : '-'}</td>
                  <td className="num px-2 py-2.5 whitespace-nowrap">{formatDate(p.permitDate)}</td>
                  <td className="num px-2 py-2.5 whitespace-nowrap">
                    {p.startDate ? formatDate(p.startDate) : p.startPlanDate ? `${formatDate(p.startPlanDate)} 예정` : '-'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.status === '착공' ? 'accent' : 'neutral'}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="num border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted sm:px-5">
        {f.status === 'failed' && `${f.message} 아래는 마지막으로 확인된 내용입니다. `}
        인허가는 행정 절차상의 기록이며 실제 분양·입주 일정이나 공급 확정을 뜻하지 않습니다. 최근 6년 안에 허가된 20세대 이상 사업만 표시합니다.
        {f.coverage && ` 조회한 법정동 ${f.coverage.done}/${f.coverage.total}곳${partial ? '(나머지는 다음 수집에서 이어서 조회)' : ''}.`} 출처:{' '}
        <a href={f.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {f.source.name}
        </a>
        {f.fetchedAt && ` · 조회 ${formatDateTime(f.fetchedAt)}`}
      </p>
    </div>
  )
}
