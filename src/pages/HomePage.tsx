import { ArrowRight, Bell, Building2, MapPin, Newspaper } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IndexChart, MedianVolumeChart, PopulationChart, UnsoldChart } from '@/components/charts'
import { SupplyNotices } from '@/components/SupplyNotices'
import { TradeTable } from '@/components/TradeTable'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Skeleton } from '@/components/ui/primitives'
import { EmptyState, NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { ZONES } from '@/config/zones'
import { useAlerts } from '@/hooks/useAlerts'
import {
  freshness,
  loadBriefing,
  loadPopulation,
  loadPresales,
  loadPriceIndex,
  loadUnsold,
  useComplexes,
  useManifest,
  useResource,
  useSummary,
} from '@/lib/data'
import { formatCount, formatDate, formatDateTime, formatPrice, formatYm } from '@/lib/format'
import { usePrefs } from '@/store/prefs'
import type { Briefing, Complex, Manifest, SummaryFile } from '@/types'

function Kpi({ label, value, sub, loading }: { label: string; value: ReactNode; sub: ReactNode; loading?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="num mt-1 text-[22px] font-extrabold tracking-tight text-ink">{value}</p>}
      <p className="mt-1 text-[12px] leading-snug text-muted">{sub}</p>
    </Card>
  )
}

function KpiRow({ manifest, summary }: { manifest: Manifest; summary: SummaryFile }) {
  const months = summary.months
  const last = months[months.length - 1]
  const prev = months[months.length - 2]
  const last12 = months.slice(-12)
  const total12 = last12.reduce((s, m) => s + m.count, 0)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label={prev ? `${formatYm(prev.ym)} 계약 거래량` : '거래량'}
        value={prev ? formatCount(prev.count) : '-'}
        sub={prev ? `해제 ${prev.cancelled}건 제외 · 신고가 끝난 최근 달` : '자료 없음'}
      />
      <Kpi
        label={prev ? `${formatYm(prev.ym)} 중위 거래금액` : '중위 거래금액'}
        value={prev?.median != null ? formatPrice(prev.median) : '-'}
        sub={prev ? `표본 ${prev.count}건 · 면적·단지 구분 없는 전체 중위값` : '자료 없음'}
      />
      <Kpi
        label={last ? `${formatYm(last.ym)} 계약(집계 중)` : '이번 달'}
        value={last ? formatCount(last.count) : '-'}
        sub="신고 기한(계약 후 30일)이 남아 계속 늘어납니다"
      />
      <Kpi
        label="최근 12개월 거래량"
        value={formatCount(total12)}
        sub={`${formatYm(last12[0].ym)}~${formatYm(last12[last12.length - 1].ym)} · 단지 ${manifest.totals.complexes.toLocaleString('ko-KR')}곳`}
      />
    </div>
  )
}

function BriefingCard({ b }: { b: Briefing }) {
  const tone = b.status === 'failed' ? 'up' : b.status === 'ok' ? 'accent' : 'neutral'
  const label = { ok: '새 거래 확인', no_new: '새 거래 없음', failed: '조회 실패', initial: '첫 수집', pending: '대기' }[b.status]
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        <span className="num text-[12px] text-muted">확인 기준일 {formatDate(b.date)}</span>
      </div>
      <ol className="space-y-1.5">
        {b.headlines.map((h, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
            <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-ink">{i + 1}</span>
            {h}
          </li>
        ))}
      </ol>
    </>
  )
}

function FavoriteChanges({ complexes, briefing }: { complexes: Complex[]; briefing: Briefing | null }) {
  const favorites = usePrefs((s) => s.favorites)
  const favs = useMemo(() => complexes.filter((c) => favorites.includes(c.id)), [complexes, favorites])
  if (favorites.length === 0) {
    return (
      <NotAvailable title="관심 단지가 없습니다" className="py-6">
        단지 상세 화면이나 지도에서 하트를 눌러 관심 단지를 저장하면 거래 변화를 여기서 볼 수 있습니다.
      </NotAvailable>
    )
  }
  const newByComplex = new Map<string, number>()
  for (const t of briefing?.newTrades ?? []) newByComplex.set(t.complexId, (newByComplex.get(t.complexId) ?? 0) + 1)
  return (
    <ul className="divide-y divide-line">
      {favs.slice(0, 5).map((c) => (
        <li key={c.id}>
          <Link to={`/complex/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold text-ink">{c.name}</span>
                {newByComplex.has(c.id) && <Badge tone="accent">새 거래 {newByComplex.get(c.id)}건</Badge>}
              </span>
              <span className="num block text-[12px] text-muted">
                {c.lastDealDate ? `최근 거래 ${formatDate(c.lastDealDate)} · 전용 ${c.lastArea}㎡ · ${c.lastFloor ?? '-'}층` : '수집 기간 내 거래 없음'}
              </span>
            </span>
            <span className="num shrink-0 text-sm font-bold text-ink">{c.lastPrice != null ? formatPrice(c.lastPrice) : '-'}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function HomePage() {
  const mres = useManifest()
  const ready = mres.status === 'ok' && mres.data.status === 'ok'
  const summary = useSummary(ready)
  const complexes = useComplexes(ready)
  const briefing = useResource('briefing', loadBriefing)
  const presales = useResource('presales', loadPresales)
  const priceIndex = useResource('price-index', loadPriceIndex)
  const unsold = useResource('unsold', loadUnsold)
  const population = useResource('population', loadPopulation)
  const unsoldOk = unsold.status === 'ok' && unsold.data.status === 'ok' && unsold.data.items.length > 1
  const populationOk = population.status === 'ok' && population.data.status === 'ok' && population.data.items.length > 1
  const setZone = usePrefs((s) => s.setZone)
  const navigate = useNavigate()
  const { fresh: freshAlerts } = useAlerts()

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-main px-5 py-5 text-white sm:px-6 sm:py-6">
        <p className="text-[12px] font-semibold text-white/70">오늘의 순천 부동산</p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">순천의 모든 집, 모든 가격, 모든 변화를 한눈에.</h1>
        <p className="num mt-2 text-[13px] text-white/75">
          {mres.status === 'ok'
            ? freshness(mres.data) === 'pending'
              ? '공공데이터 연결 대기 중'
              : `국토교통부 실거래가 공개 자료 · 최종 갱신 ${formatDateTime(mres.data.generatedAt)}`
            : mres.status === 'error'
              ? '데이터 상태를 확인하지 못했습니다'
              : '데이터 상태 확인 중…'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <Link to="/trades">실거래 조회</Link>
          </Button>
          <Button asChild className="border-white/25 bg-white/10 text-white hover:bg-white/20">
            <Link to="/map">지도로 탐색</Link>
          </Button>
        </div>
      </section>

      {freshAlerts.length > 0 && (
        <Link
          to="/alerts"
          className="flex items-center gap-2.5 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-semibold text-ink hover:brightness-95"
        >
          <Bell className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            새 청약 공고 {freshAlerts.length}건 — {freshAlerts[0].title}
          </span>
          <ArrowRight className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
        </Link>
      )}

      {mres.status === 'ok' && !ready && (
        <Card>
          <PendingState />
        </Card>
      )}
      {mres.status === 'error' && (
        <Card>
          <ResourceView res={mres}>{() => null}</ResourceView>
        </Card>
      )}

      {ready && (
        <>
          {summary.status === 'ok' ? (
            <KpiRow manifest={mres.data} summary={summary.data} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {['거래량', '중위 거래금액', '이번 달', '최근 12개월'].map((l) => (
                <Kpi key={l} label={l} value="" sub="불러오는 중" loading={summary.status !== 'error'} />
              ))}
            </div>
          )}

          <Card>
            <CardHeader
              title="순천시 아파트 매매 실거래 현황"
              desc="계약월 기준 · 해제 거래 제외"
              action={
                <Link to="/trades" className="flex items-center gap-0.5 text-[13px] font-semibold text-accent-ink">
                  자세히 <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <CardBody>
              <ResourceView res={summary}>
                {(s) => (
                  <>
                    <MedianVolumeChart points={s.months.map((m) => ({ ...m, min: null, max: null }))} />
                    <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-muted">
                      월 중위 거래금액은 그 달에 거래된 단지·면적 구성에 따라 달라집니다. 이 값의 오르내림만으로 순천시 전체 시세가
                      올랐다거나 내렸다고 판단할 수 없습니다.
                    </p>
                  </>
                )}
              </ResourceView>
            </CardBody>
          </Card>
        </>
      )}

      {priceIndex.status === 'ok' && priceIndex.data.status === 'ok' && priceIndex.data.items.length > 1 && (
        <Card>
          <CardHeader
            title="순천시 아파트 매매가격지수"
            desc={`한국부동산원 전국주택가격동향조사(월간) · 조회 ${formatDateTime(priceIndex.data.fetchedAt)}`}
          />
          <CardBody>
            <IndexChart items={priceIndex.data.items.slice(-60)} />
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              표본 주택의 가격 변동을 조사해 만든 통계 지수입니다. 위의 실거래 중위가와는 산출 방식이 다르며, 개별 단지의 가격을 뜻하지 않습니다.{' '}
              <a href={priceIndex.data.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                출처
              </a>
            </p>
          </CardBody>
        </Card>
      )}

      {(unsoldOk || populationOk) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {unsoldOk && unsold.status === 'ok' && (
            <Card>
              <CardHeader title="순천시 미분양 주택" desc={`국토교통 통계누리 · 조회 ${formatDateTime(unsold.data.fetchedAt)}`} />
              <CardBody>
                <UnsoldChart items={unsold.data.items.slice(-24)} />
              </CardBody>
            </Card>
          )}
          {populationOk && population.status === 'ok' && (
            <Card>
              <CardHeader title="순천시 주민등록 인구" desc={`통계청 KOSIS · 조회 ${formatDateTime(population.data.fetchedAt)}`} />
              <CardBody>
                <PopulationChart items={population.data.items} />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                <Newspaper className="size-4 text-accent-ink" aria-hidden="true" /> 오늘의 부동산 브리핑
              </span>
            }
            action={
              <Link to="/briefing" className="flex items-center gap-0.5 text-[13px] font-semibold text-accent-ink">
                전체 보기 <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <CardBody>
            <ResourceView res={briefing} rows={3}>
              {(b) => <BriefingCard b={b} />}
            </ResourceView>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="관심 단지 거래 변화" desc="이 기기에 저장된 관심 단지 기준" />
          <div className="pt-2">
            {ready ? (
              <ResourceView res={complexes} rows={3}>
                {(list) => <FavoriteChanges complexes={list} briefing={briefing.status === 'ok' ? briefing.data : null} />}
              </ResourceView>
            ) : (
              <PendingState className="py-6" />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="생활권 바로가기" desc="생활권을 고르면 실거래 화면에서 해당 지역 거래를 보여 줍니다" />
        <CardBody className="flex flex-wrap gap-2">
          {ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => {
                setZone(z.id)
                navigate('/trades')
              }}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink hover:border-accent hover:bg-accent-soft"
            >
              <MapPin className="size-3.5 text-accent-ink" aria-hidden="true" />
              {z.name}
              {z.approx && <span className="text-[11px] font-medium text-muted">근사</span>}
            </button>
          ))}
        </CardBody>
      </Card>

      {ready && (
        <Card>
          <CardHeader
            title="최근 확인된 실거래"
            desc="계약일 최신순 · 해제 거래는 구분 표시"
            action={
              <Link to="/trades" className="flex items-center gap-0.5 text-[13px] font-semibold text-accent-ink">
                전체 <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="pt-2">
            <ResourceView res={summary}>
              {(s) => (s.recentTrades.length ? <TradeTable trades={s.recentTrades.slice(0, 10)} /> : <EmptyState title="거래가 없습니다" />)}
            </ResourceView>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <Building2 className="size-4 text-accent-ink" aria-hidden="true" /> 최신 분양·개발 소식
            </span>
          }
          action={
            <Link to="/presales" className="flex items-center gap-0.5 text-[13px] font-semibold text-accent-ink">
              분양 정보 <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <ResourceView res={presales} rows={2}>
          {(p) =>
            p.status === 'ok' && p.items.length > 0 ? (
              <ul className="divide-y divide-line pt-2">
                {p.items.slice(0, 3).map((it) => (
                  <li key={it.id} className="px-4 py-3 sm:px-5">
                    <p className="text-sm font-bold text-ink">{it.name}</p>
                    <p className="num text-[12px] text-muted">
                      {it.location} · 모집공고 {formatDate(it.announceDate)}
                      {it.receiptStart && ` · 접수 ${formatDate(it.receiptStart)}~${formatDate(it.receiptEnd)}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : p.status === 'ok' ? (
              <NotAvailable title="확인된 순천시 분양 공고가 없습니다" className="py-6" />
            ) : p.status === 'failed' ? (
              <NotAvailable title="분양정보 조회 실패" className="py-6">
                {p.message}
              </NotAvailable>
            ) : (
              <PendingState title="분양정보 연결 대기 중" className="py-6">
                청약홈 분양정보는 수집이 실행되면 표시됩니다.
              </PendingState>
            )
          }
        </ResourceView>
        <div className="border-t border-line">
          <p className="px-4 pt-3 text-[13px] font-bold text-ink sm:px-5">LH 분양 · 임대 공고</p>
          <SupplyNotices limit={3} compact />
        </div>
      </Card>
    </div>
  )
}
