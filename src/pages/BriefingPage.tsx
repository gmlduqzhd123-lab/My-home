import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TradeTable } from '@/components/TradeTable'
import { Badge, Card, CardBody, CardHeader, PageTitle } from '@/components/ui/primitives'
import { NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { cn } from '@/lib/cn'
import { loadBriefing, loadBriefingArchive, loadBriefingIndex, useResource } from '@/lib/data'
import { formatDate, formatDateTime, formatPrice } from '@/lib/format'
import { usePrefs } from '@/store/prefs'
import type { Briefing, BriefingStatus } from '@/types'

const STATUS: Record<BriefingStatus, { label: string; tone: 'accent' | 'neutral' | 'up' | 'warn' }> = {
  ok: { label: '새 거래 확인', tone: 'accent' },
  no_new: { label: '새로 확인된 거래 없음', tone: 'neutral' },
  failed: { label: '조회 실패', tone: 'up' },
  initial: { label: '첫 수집', tone: 'warn' },
  pending: { label: '연결 대기', tone: 'warn' },
}

function Section({ n, title, desc, children }: { n: number; title: string; desc?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="num flex size-6 items-center justify-center rounded-full bg-main text-[12px] font-bold text-white dark:bg-surface-2">{n}</span>
            {title}
          </span>
        }
        desc={desc}
      />
      {children}
    </Card>
  )
}

function BriefingView({ b }: { b: Briefing }) {
  const favorites = usePrefs((s) => s.favorites)
  const favNew = b.newTrades.filter((t) => favorites.includes(t.complexId))
  const favCancel = b.newCancellations.filter((t) => favorites.includes(t.complexId))
  const failed = b.status === 'failed'

  return (
    <div className="space-y-4">
      <Section n={1} title="데이터 확인 기준일">
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-lg font-extrabold text-ink">{formatDate(b.date)}</span>
            <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>
          </div>
          <p className="num mt-1 text-[13px] leading-relaxed text-muted">
            수집 완료 {formatDateTime(b.generatedAt)}
            {b.previousDate ? ` · 이전 확인 ${formatDate(b.previousDate)} 이후 달라진 내용` : ''}. 여기의 ‘새로 확인’은 수집 시점 기준이며, 각 거래의
            계약일은 목록에 따로 표시합니다.
          </p>
          {b.message && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{b.message}</p>}
        </CardBody>
      </Section>

      <Section n={2} title="오늘의 핵심 3줄">
        <CardBody>
          <ol className="space-y-2">
            {b.headlines.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
                <span className="num font-bold text-accent-ink">{i + 1}.</span>
                {h}
              </li>
            ))}
          </ol>
        </CardBody>
      </Section>

      <Section
        n={3}
        title="새로 확인된 주요 실거래"
        desc={b.newTradesTotal > b.newTrades.length ? `전체 ${b.newTradesTotal}건 중 ${b.newTrades.length}건 표시` : `${b.newTradesTotal}건`}
      >
        <div className="pt-2">
          {failed ? (
            <NotAvailable title="조회 실패" className="py-6">
              공공데이터 조회에 실패해 새 거래를 확인하지 못했습니다. ‘새 거래 없음’과는 다릅니다.
            </NotAvailable>
          ) : b.status === 'initial' ? (
            <NotAvailable title="첫 수집" className="py-6">
              첫 수집에서는 이전과 비교할 자료가 없어 새 거래를 구분하지 않습니다.
            </NotAvailable>
          ) : b.newTrades.length ? (
            <TradeTable trades={b.newTrades} />
          ) : (
            <NotAvailable title="새로 확인된 거래 없음" className="py-6" />
          )}
        </div>
        {(b.newCancellations.length > 0 || b.corrections.length > 0) && (
          <div className="border-t border-line">
            <p className="px-4 pt-3 text-[13px] font-bold text-ink sm:px-5">해제·정정으로 확인된 변경</p>
            {b.newCancellations.length > 0 && <TradeTable trades={b.newCancellations} />}
            {b.corrections.length > 0 && (
              <ul className="space-y-1 px-4 pb-3 text-[13px] text-ink sm:px-5">
                {b.corrections.map((c) => (
                  <li key={c.id} className="num">
                    {c.aptNm}: {c.field} {c.field === '거래금액' ? `${formatPrice(Number(c.before))} → ${formatPrice(Number(c.after))}` : `${c.before} → ${c.after}`}{' '}
                    <span className="text-muted">(정정 추정)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section n={4} title="주요 생활권별 동향" desc="새로 확인된 거래 기준 · 생활권은 법정동 이름으로 묶은 서비스용 구분(금당지구는 조례동·연향동과 중복 집계)">
        {b.zones.length === 0 || failed ? (
          <NotAvailable title={failed ? '조회 실패' : '집계할 새 거래가 없습니다'} className="py-6" />
        ) : (
          <CardBody className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {b.zones.map((z) => (
              <div key={z.zoneId} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <p className={cn('text-[13px] font-bold', z.newCount === 0 ? 'text-muted' : 'text-ink')}>{z.name}</p>
                <p className="num text-[12px] text-muted">
                  새 거래 {z.newCount}건{z.median != null && ` · 중위 ${formatPrice(z.median)}`}
                </p>
              </div>
            ))}
          </CardBody>
        )}
      </Section>

      <Section n={5} title="관심 단지 거래 변화" desc="이 기기에 저장된 관심 단지 기준">
        <div className="pt-2">
          {favorites.length === 0 ? (
            <NotAvailable title="관심 단지가 없습니다" className="py-6">
              <Link to="/favorites" className="font-semibold text-accent-ink underline underline-offset-2">
                관심 단지 추가하기
              </Link>
            </NotAvailable>
          ) : failed ? (
            <NotAvailable title="조회 실패" className="py-6" />
          ) : favNew.length + favCancel.length === 0 ? (
            <NotAvailable title="관심 단지에서 새로 확인된 거래 없음" className="py-6" />
          ) : (
            <TradeTable trades={[...favNew, ...favCancel]} />
          )}
        </div>
      </Section>

      <Section n={6} title="신규 분양 · 개발 소식">
        {b.presales.length ? (
          <ul className="divide-y divide-line pt-2">
            {b.presales.map((p) => (
              <li key={p.id} className="px-4 py-3 sm:px-5">
                <p className="text-sm font-bold text-ink">{p.name}</p>
                <p className="num text-[12px] text-muted">
                  {p.location} · 모집공고 {formatDate(p.announceDate)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <NotAvailable title="확인된 분양 공고 없음" className="py-6">
            청약홈 분양정보가 연결되지 않았거나 순천시 공고가 없습니다. 개발·고시 소식은 연계하지 않았습니다.
          </NotAvailable>
        )}
      </Section>

      <Section n={7} title="매수 검토 시 확인할 사항">
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink">
            {b.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </CardBody>
      </Section>

      <Section n={8} title="출처">
        <CardBody>
          <ul className="space-y-1.5">
            {b.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink underline underline-offset-2">
                  {s.name} <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </CardBody>
      </Section>
    </div>
  )
}

export default function BriefingPage() {
  const { date } = useParams()
  const res = useResource(`briefing:${date ?? 'latest'}`, () => (date ? loadBriefingArchive(date) : loadBriefing()))
  const index = useResource('briefing-index', loadBriefingIndex)
  return (
    <div className="space-y-4">
      <PageTitle title="순천 부동산 브리핑" desc="공공데이터에서 새로 확인된 내용을 규칙에 따라 자동으로 정리합니다(AI 생성 아님)" />
      {res.status === 'error' && res.error.kind === 'not_found' ? (
        <Card>
          <PendingState title={date ? '해당 날짜의 브리핑이 없습니다' : '브리핑 연결 대기 중'}>
            {date ? '조회 실패한 날의 브리핑은 보관되지 않습니다.' : '첫 데이터 수집이 실행되면 브리핑이 만들어집니다.'}
          </PendingState>
        </Card>
      ) : (
        <ResourceView res={res} rows={8}>
          {(b) => <BriefingView b={b} />}
        </ResourceView>
      )}
      {index.status === 'ok' && index.data.items.length > 0 && (
        <Card>
          <CardHeader title="지난 브리핑" />
          <CardBody className="flex flex-wrap gap-2">
            {index.data.items.slice(0, 30).map((i) =>
              i.status === 'failed' ? (
                <span key={i.date} className="num rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted" title="조회 실패">
                  {formatDate(i.date)} 실패
                </span>
              ) : (
                <Link
                  key={i.date}
                  to={`/briefing/${i.date}`}
                  aria-current={i.date === date ? 'page' : undefined}
                  className={cn(
                    'num rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold',
                    i.date === date ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink hover:bg-surface-2',
                  )}
                >
                  {formatDate(i.date)}
                  {i.newTradesTotal > 0 && ` · ${i.newTradesTotal}건`}
                </Link>
              ),
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
