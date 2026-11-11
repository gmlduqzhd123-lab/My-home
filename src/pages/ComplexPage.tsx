import { ChevronLeft } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PriceTrendChart, VolumeChart } from '@/components/charts'
import { CompareButton, FavoriteButton } from '@/components/ComplexActions'
import { KakaoMap } from '@/components/KakaoMap'
import { NearbyPlaces, OfficialSchoolLinks } from '@/components/NearbyPlaces'
import { RentTable } from '@/components/RentTable'
import { NearestSchools } from '@/components/Schools'
import { TradeTable } from '@/components/TradeTable'
import { Badge, Card, CardBody, CardHeader, Segmented } from '@/components/ui/primitives'
import { EmptyState, NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { loadComplexRents, useComplexes, useComplexTrades, useManifest, useResource } from '@/lib/data'
import { isCorp, isDirect } from '@/lib/filters'
import { complexFacts } from '@/lib/facts'
import { formatDate, formatDateTime, formatPrice, ymRange } from '@/lib/format'
import { areaGroup, byAreaGroup, compareDateDesc, monthlyAggregate, summarize } from '@/lib/stats'
import type { Complex, Manifest, Trade } from '@/types'

const NA = '자료 확인 불가'

function Info({ label, value }: { label: string; value: ReactNode }) {
  const missing = value == null || value === ''
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
      <dt className="text-[12px] font-semibold text-muted">{label}</dt>
      <dd className={missing ? 'text-[13px] text-muted' : 'num text-sm font-bold text-ink'}>{missing ? NA : value}</dd>
    </div>
  )
}

function Detail({ c, trades, manifest }: { c: Complex; trades: Trade[]; manifest: Manifest }) {
  const groups = useMemo(() => byAreaGroup(trades), [trades])
  // 기본 선택: 거래가 가장 많은 면적
  const top = useMemo(() => [...groups].sort((a, b) => b.count - a.count)[0]?.area ?? null, [groups])
  const [areaSel, setAreaSel] = useState<number | 'all' | null>(null)
  const area = areaSel ?? top ?? 'all'

  // 직거래·법인 거래는 일반 거래와 금액 수준이 다를 수 있어 따로 빼고 볼 수 있게 한다
  const [plainOnly, setPlainOnly] = useState(false)
  const special = useMemo(() => trades.filter((t) => isDirect(t) || isCorp(t)).length, [trades])
  const scoped = useMemo(
    () => trades.filter((t) => (area === 'all' || areaGroup(t.area) === area) && (!plainOnly || !(isDirect(t) || isCorp(t)))),
    [trades, area, plainOnly],
  )
  const rents = useResource(`complex-rent:${c.id}`, () => loadComplexRents(c.id))
  const sorted = useMemo(() => [...scoped].sort(compareDateDesc), [scoped])
  const sum = useMemo(() => summarize(scoped), [scoped])
  const yms = useMemo(() => {
    const all = manifest.months.map((m) => m.ym).sort()
    return all.length ? ymRange(all[0], all[all.length - 1]) : []
  }, [manifest])
  const monthly = useMemo(() => monthlyAggregate(scoped, yms), [scoped, yms])
  const k = c.kapt
  const facts = complexFacts(c)

  return (
    <div className="space-y-4">
      <div>
        <Link to="/map" className="mb-2 inline-flex items-center gap-0.5 text-[13px] font-semibold text-muted hover:text-ink">
          <ChevronLeft className="size-4" /> 단지 탐색
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{c.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {c.address}
              {c.roadAddress && ` (${c.roadAddress})`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FavoriteButton id={c.id} name={c.name} />
            <CompareButton id={c.id} name={c.name} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="단지 정보"
          desc={facts.basis ? `출처: ${facts.basis}` : '공동주택 기본정보(K-apt)·건축물대장이 연결되지 않은 단지입니다'}
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <Info label="준공연도" value={c.buildYear ? `${c.buildYear}년` : null} />
            <Info label="사용승인일" value={facts.useDate ? formatDate(facts.useDate) : null} />
            <Info label="총세대수" value={facts.households != null ? `${facts.households.toLocaleString('ko-KR')}세대` : null} />
            <Info label="동수" value={facts.dongCount != null ? `${facts.dongCount}개 동` : null} />
            <Info
              label="최고층"
              value={facts.topFloor != null ? `${facts.topFloor}층${facts.basementFloors ? ` (지하 ${facts.basementFloors}층)` : ''}` : null}
            />
            <Info label="건폐율" value={facts.coverageRatio != null ? `${facts.coverageRatio}%` : null} />
            <Info label="용적률" value={facts.floorAreaRatio != null ? `${facts.floorAreaRatio}%` : null} />
            <Info label="난방방식" value={k?.heating} />
            <Info label="복도유형" value={k?.hallType} />
            <Info label="주차대수" value={facts.parking != null ? `${facts.parking.toLocaleString('ko-KR')}대` : null} />
            <Info label="시공사" value={k?.builder} />
            <Info label="버스정류장까지" value={k?.busTime} />
          </dl>
          <dl className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <Info label="부대·복리시설" value={k?.welfare} />
            <Info label="편의시설" value={k?.convenient} />
          </dl>
          <p className="mt-2 text-[12px] text-muted">준공연도는 실거래 자료의 건축년도입니다. 그 밖의 항목은 K-apt 공동주택 기본정보를 먼저 쓰고, 없으면 건축물대장 값으로 채웁니다. 건폐율·용적률은 건축물대장 값입니다. 관리비는 연계하지 않았습니다.</p>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="위치" desc={c.lat != null ? `좌표 출처: ${c.coordSource}` : undefined} className="pb-3" />
        {c.lat != null ? (
          <KakaoMap complexes={[c]} selectedId={c.id} className="h-64 sm:h-80" fitKey={c.id} />
        ) : (
          <NotAvailable title="지도상 위치 확인 불가" className="py-8">
            이 단지의 좌표가 확인되지 않았습니다. 임의 위치는 표시하지 않습니다.
          </NotAvailable>
        )}
      </Card>

      <Card>
        <CardHeader title="전용면적 선택" desc="면적이 다른 거래를 섞지 않도록 면적별로 나누어 봅니다" />
        <CardBody>
          {groups.length === 0 ? (
            <p className="text-[13px] text-muted">수집 기간 안에 집계 대상 거래가 없습니다.</p>
          ) : (
            <Segmented
              label="전용면적"
              value={area}
              onChange={setAreaSel}
              options={[...groups.map((g) => ({ value: g.area as number | 'all', label: `${g.area}㎡ (${g.count}건)` })), { value: 'all', label: '전체' }]}
            />
          )}
          {special > 0 && (
            <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={plainOnly} onChange={(e) => setPlainOnly(e.target.checked)} />
              직거래·법인 거래 제외 (이 단지 {special}건)
            </label>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Info label="거래 건수 (해제 제외)" value={`${sum.count}건`} />
            <Info label="중위 거래금액" value={sum.median != null ? formatPrice(sum.median) : null} />
            <Info label="최고" value={sum.max ? `${formatPrice(sum.max.price)} · ${formatDate(sum.max.dealDate)}` : null} />
            <Info label="최저" value={sum.min ? `${formatPrice(sum.min.price)} · ${formatDate(sum.min.dealDate)}` : null} />
          </dl>
          {area === 'all' && groups.length > 1 && (
            <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn">
              ‘전체’는 면적이 다른 거래를 함께 집계합니다. 가격 흐름은 면적을 하나 골라서 확인하세요.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="거래금액 추이" desc={area === 'all' ? '전체 면적' : `전용 ${area}㎡`} />
          <CardBody>
            <PriceTrendChart trades={scoped} points={monthly} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="월별 거래량" desc={area === 'all' ? '전체 면적' : `전용 ${area}㎡`} />
          <CardBody>
            <VolumeChart points={monthly} height={260} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="실거래 목록"
          desc="‘직전 같은 면적 거래 대비’는 이 단지의 같은 면적 직전 거래와 비교한 값입니다. 층이 다르면 (층 다름)으로 표시합니다"
          action={sum.cancelled > 0 ? <Badge tone="up">해제·미확인 {sum.cancelled}건</Badge> : undefined}
        />
        <div className="pt-2">{sorted.length ? <TradeTable trades={sorted} history={trades} showComplex={false} /> : <EmptyState title="거래가 없습니다" />}</div>
        <p className="num border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
          출처: 국토교통부 아파트 매매 실거래가 상세 자료 · 데이터 조회 {formatDateTime(manifest.generatedAt)}
        </p>
      </Card>

      <Card>
        <CardHeader
          title="전월세 실거래"
          desc={area === 'all' ? '전체 면적 · 계약일 최신순' : `전용 ${area}㎡ · 계약일 최신순`}
        />
        <div className="pt-2">
          <ResourceView res={rents} rows={3} pendingWhenMissing={false}>
            {(list) => {
              const shown = area === 'all' ? list : list.filter((r) => areaGroup(r.area) === area)
              return shown.length ? (
                <RentTable rents={shown} showComplex={false} />
              ) : (
                <NotAvailable title="전월세 거래 없음" className="py-6">
                  {list.length
                    ? '선택한 면적의 전월세 거래가 수집 기간 안에 없습니다.'
                    : manifest.rentMonths?.length
                      ? '수집 기간 안에 이 단지의 전월세 거래가 없습니다.'
                      : '전월세 자료가 아직 연결되지 않았습니다.'}
                </NotAvailable>
              )
            }}
          </ResourceView>
        </div>
      </Card>

      <Card>
        <CardHeader title="가까운 학교" desc="학교 위치 표준데이터 기준 직선거리 · 학교급별 3곳. 배정 학교가 아닙니다" />
        <NearestSchools lat={c.lat} lng={c.lng} />
      </Card>

      <Card>
        <CardHeader title="주변 생활시설" desc="단지 좌표 기준 직선거리(Kakao 장소 검색). 실제 이동 거리·통학로와 다릅니다" />
        <NearbyPlaces lat={c.lat} lng={c.lng} />
        <div className="border-t border-line p-4 sm:p-5">
          <p className="mb-2 text-[13px] leading-relaxed text-ink">
            가까운 학교가 곧 배정 학교는 아닙니다. 초등학교 통학구역과 중학교 학교군은 교육청 고시로 정해지므로 아래 공식 서비스에서 주소로
            확인하세요.
          </p>
          <OfficialSchoolLinks />
        </div>
      </Card>
    </div>
  )
}

export default function ComplexPage() {
  const { id = '' } = useParams()
  const mres = useManifest()
  const ready = mres.status === 'ok' && mres.data.status === 'ok'
  const cres = useComplexes(ready)
  const tres = useComplexTrades(ready ? id : null)

  if (mres.status === 'ok' && !ready) {
    return (
      <Card>
        <PendingState />
      </Card>
    )
  }
  return (
    <ResourceView res={mres}>
      {(m) => (
        <ResourceView res={cres} rows={6}>
          {(list) => {
            const c = list.find((x) => x.id === id)
            if (!c) return <NotAvailable title="단지를 찾을 수 없습니다">주소가 바뀌었거나 수집 자료에 없는 단지입니다.</NotAvailable>
            return (
              <ResourceView res={tres} rows={6} pendingWhenMissing={false}>
                {(trades) => <Detail key={c.id} c={c} trades={trades} manifest={m} />}
              </ResourceView>
            )
          }}
        </ResourceView>
      )}
    </ResourceView>
  )
}
