import { ExternalLink } from 'lucide-react'
import { PermitList } from '@/components/Permits'
import { SupplyNotices } from '@/components/SupplyNotices'
import { Badge, Card, CardBody, CardHeader, PageTitle } from '@/components/ui/primitives'
import { NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { loadPresales, useResource } from '@/lib/data'
import { formatDate, formatDateTime, formatPrice } from '@/lib/format'
import type { PresaleItem } from '@/types'

const NA = '공고 확인 불가'

function range(a: string | null, b: string | null): string {
  if (!a && !b) return NA
  return a && b && a !== b ? `${formatDate(a)} ~ ${formatDate(b)}` : formatDate(a ?? b)
}

function moveIn(v: string | null): string {
  if (!v) return NA
  const m = v.match(/^(\d{4})(\d{2})$/)
  return m ? `${m[1]}년 ${Number(m[2])}월` : v
}

function Item({ p }: { p: PresaleItem }) {
  const rows: [string, string][] = [
    ['공급 세대수', p.households != null ? `${p.households.toLocaleString('ko-KR')}세대` : NA],
    ['모집공고일', p.announceDate ? formatDate(p.announceDate) : NA],
    ['청약 접수', range(p.receiptStart, p.receiptEnd)],
    ['당첨자 발표', p.winnerDate ? formatDate(p.winnerDate) : NA],
    ['계약', range(p.contractStart, p.contractEnd)],
    ['입주 예정', moveIn(p.moveInMonth)],
    ['분양가격', p.prices.length ? p.prices.map((x) => `${x.type} 최고 ${formatPrice(x.price)}원`).join(' · ') : NA],
  ]
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-ink">{p.name}</h2>
            <p className="text-[13px] text-muted">{p.location}</p>
          </div>
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold text-accent-ink hover:bg-surface-2">
              모집공고 <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <dl className="num mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
              <dt className="text-[12px] font-semibold text-muted">{k}</dt>
              <dd className="text-[13px] font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  )
}

export default function PresalesPage() {
  const res = useResource('presales', loadPresales)
  return (
    <div className="space-y-4">
      <PageTitle
        title="분양 · 입주 정보"
        desc="한국부동산원 청약홈 분양정보(공공데이터포털) 기준. 일정·금액은 반드시 모집공고 원문으로 확인하세요"
        action={<Badge tone="warn">2단계 기능 · 실제 조회 미검증</Badge>}
      />
      <Card>
        <CardHeader title="LH 분양 · 임대 공고" desc="한국토지주택공사 공고 중 공고명에 ‘순천’이 들어간 것 · 게시일 최신순" />
        <div className="pt-2">
          <SupplyNotices />
        </div>
      </Card>

      <Card>
        <CardHeader title="주택 인허가 현황" desc="순천시에서 허가받은 주택 사업 — 앞으로 공급될 가능성이 있는 단지 · 허가일 최신순" />
        <div className="pt-2">
          <PermitList />
        </div>
      </Card>

      <h2 className="pt-2 text-[15px] font-bold text-ink">청약홈 분양 공고</h2>
      <ResourceView res={res}>
        {(f) => (
          <>
            {f.status === 'pending' && (
              <Card>
                <PendingState title="분양정보 연결 대기 중">
                  청약홈 분양정보 조회 서비스 연동 코드는 준비되어 있으며, 인증키 등록 후 수집이 실행되면 순천시 공고가 표시됩니다. 확인되지 않은
                  일정은 만들지 않습니다.
                </PendingState>
              </Card>
            )}
            {f.status === 'failed' && (
              <Card>
                <NotAvailable title="분양정보 조회 실패">
                  {f.message} {f.items.length > 0 && `아래는 ${formatDateTime(f.fetchedAt)}에 마지막으로 확인된 내용입니다.`}
                </NotAvailable>
              </Card>
            )}
            {f.status === 'ok' && f.items.length === 0 && (
              <Card>
                <NotAvailable title="확인된 순천시 분양 공고가 없습니다">청약홈에 등록된 공급위치 기준입니다.</NotAvailable>
              </Card>
            )}
            {f.items.map((p) => (
              <Item key={p.id} p={p} />
            ))}
            <p className="num text-[12px] text-muted">
              출처:{' '}
              <a href={f.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {f.source.name}
              </a>
              {f.fetchedAt && ` · 조회 ${formatDateTime(f.fetchedAt)}`} · 공식 청약 신청은{' '}
              <a href="https://www.applyhome.co.kr/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                청약홈
              </a>
              에서만 가능합니다.
            </p>
          </>
        )}
      </ResourceView>
    </div>
  )
}
