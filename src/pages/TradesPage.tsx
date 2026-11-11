import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MedianVolumeChart, PriceTrendChart } from '@/components/charts'
import { TradeTable } from '@/components/TradeTable'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, Field, Input, PageTitle, Segmented, Select } from '@/components/ui/primitives'
import { EmptyState, PendingState, ResourceView } from '@/components/ui/states'
import { ZoneNote } from '@/components/ZoneNote'
import { ALL_ZONE, ZONES } from '@/config/zones'
import { availableYms, useManifest, useMonths } from '@/lib/data'
import { defaultTradeFilter, distinctDongs, filterTrades, parseNum, type TradeFilter, type TradeSort } from '@/lib/filters'
import { formatDate, formatDateTime, formatFloor, formatPrice, formatYm, shiftYm, ymRange } from '@/lib/format'
import { areaGroup, monthlyAggregate, summarize } from '@/lib/stats'
import { usePrefs } from '@/store/prefs'
import type { Manifest, Trade } from '@/types'

const PRESETS = [
  { value: 3, label: '3개월' },
  { value: 6, label: '6개월' },
  { value: 12, label: '1년' },
  { value: 24, label: '2년' },
]

const SORTS: { value: TradeSort; label: string }[] = [
  { value: 'date_desc', label: '계약일 최신순' },
  { value: 'date_asc', label: '계약일 오래된순' },
  { value: 'price_desc', label: '금액 높은순' },
  { value: 'price_asc', label: '금액 낮은순' },
  { value: 'area_desc', label: '면적 넓은순' },
  { value: 'area_asc', label: '면적 좁은순' },
]

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-3">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="num mt-0.5 text-lg font-extrabold tracking-tight text-ink">{value}</p>
      {sub && <p className="num mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  )
}

const tradeSub = (t: Trade | null) => (t ? `${t.aptNm} · ${t.area}㎡ · ${formatFloor(t.floor)} · ${formatDate(t.dealDate)}` : undefined)

function NumPair({
  label,
  unit,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string
  unit: string
  min: number | null
  max: number | null
  onMin: (v: number | null) => void
  onMax: (v: number | null) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-[12px] font-semibold text-muted">
        {label} <span className="font-normal">({unit})</span>
      </legend>
      <div className="flex items-center gap-1.5">
        <Input inputMode="decimal" aria-label={`${label} 최소`} placeholder="최소" value={min ?? ''} onChange={(e) => onMin(parseNum(e.target.value))} />
        <span className="text-muted">~</span>
        <Input inputMode="decimal" aria-label={`${label} 최대`} placeholder="최대" value={max ?? ''} onChange={(e) => onMax(parseNum(e.target.value))} />
      </div>
    </fieldset>
  )
}

function TradesView({ manifest }: { manifest: Manifest }) {
  const [params] = useSearchParams()
  const zoneId = usePrefs((s) => s.zoneId)
  const setZone = usePrefs((s) => s.setZone)
  const allYms = useMemo(() => manifest.months.map((m) => m.ym).sort(), [manifest])
  const lastYm = allYms[allYms.length - 1]
  const firstYm = allYms[0]

  const [f, setF] = useState<TradeFilter>(() => ({
    ...defaultTradeFilter(shiftYm(lastYm, -11) < firstYm ? firstYm : shiftYm(lastYm, -11), lastYm),
    q: params.get('q') ?? '',
  }))
  const [showMore, setShowMore] = useState(false)
  const set = (patch: Partial<TradeFilter>) => setF((cur) => ({ ...cur, ...patch }))
  const filter: TradeFilter = { ...f, zoneId }

  const yms = useMemo(() => availableYms(manifest, f.fromYm, f.toYm), [manifest, f.fromYm, f.toYm])
  const res = useMonths(yms)
  const preset = PRESETS.find((p) => f.toYm === lastYm && f.fromYm === (shiftYm(lastYm, -(p.value - 1)) < firstYm ? firstYm : shiftYm(lastYm, -(p.value - 1))))

  const reset = () => {
    setF(defaultTradeFilter(shiftYm(lastYm, -11) < firstYm ? firstYm : shiftYm(lastYm, -11), lastYm))
    setZone(ALL_ZONE)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-[12px] font-semibold text-muted">거래 기간 (계약월)</p>
              <Segmented
                label="거래 기간"
                value={preset?.value ?? null}
                options={PRESETS}
                onChange={(n) => set({ fromYm: shiftYm(lastYm, -(n - 1)) < firstYm ? firstYm : shiftYm(lastYm, -(n - 1)), toYm: lastYm })}
              />
            </div>
            <Field label="시작 월" className="w-28">
              <Select value={f.fromYm} onChange={(e) => set({ fromYm: e.target.value, toYm: e.target.value > f.toYm ? e.target.value : f.toYm })}>
                {allYms.map((ym) => (
                  <option key={ym} value={ym}>
                    {formatYm(ym)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="끝 월" className="w-28">
              <Select value={f.toYm} onChange={(e) => set({ toYm: e.target.value, fromYm: e.target.value < f.fromYm ? e.target.value : f.fromYm })}>
                {allYms.map((ym) => (
                  <option key={ym} value={ym}>
                    {formatYm(ym)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="단지명">
              <Input type="search" placeholder="예: 단지 이름 일부" value={f.q} onChange={(e) => set({ q: e.target.value })} />
            </Field>
            <Field label="생활권">
              <Select value={zoneId} onChange={(e) => setZone(e.target.value)}>
                <option value={ALL_ZONE}>순천시 전체</option>
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.kind})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="법정동">
              <Select value={f.dong} onChange={(e) => set({ dong: e.target.value })}>
                <option value="">전체 법정동</option>
                {res.status === 'ok' &&
                  distinctDongs(res.data).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="정렬">
              <Select value={f.sort} onChange={(e) => set({ sort: e.target.value as TradeSort })}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={showMore ? 'soft' : 'outline'} aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
              <SlidersHorizontal /> 면적·금액·층 조건
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw /> 조건 초기화
            </Button>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.includeCancelled} onChange={(e) => set({ includeCancelled: e.target.checked })} />
              해제 거래도 목록에 표시
            </label>
          </div>

          {showMore && (
            <div className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-3">
              <NumPair label="전용면적" unit="㎡" min={f.areaMin} max={f.areaMax} onMin={(v) => set({ areaMin: v })} onMax={(v) => set({ areaMax: v })} />
              <NumPair label="거래금액" unit="만원" min={f.priceMin} max={f.priceMax} onMin={(v) => set({ priceMin: v })} onMax={(v) => set({ priceMax: v })} />
              <NumPair label="층" unit="층" min={f.floorMin} max={f.floorMax} onMin={(v) => set({ floorMin: v })} onMax={(v) => set({ floorMax: v })} />
            </div>
          )}
          <ZoneNote zoneId={zoneId} />
        </CardBody>
      </Card>

      <ResourceView res={res} rows={8}>
        {(all) => <Results all={all} filter={filter} manifest={manifest} />}
      </ResourceView>
    </div>
  )
}

function Results({ all, filter, manifest }: { all: Trade[]; filter: TradeFilter; manifest: Manifest }) {
  const list = useMemo(() => filterTrades(all, filter), [all, filter])
  const sum = useMemo(() => summarize(list), [list])
  const yms = useMemo(() => ymRange(filter.fromYm, filter.toYm), [filter.fromYm, filter.toYm])
  const monthly = useMemo(() => monthlyAggregate(list, yms), [list, yms])
  // 한 단지·한 면적 그룹으로 좁혀졌을 때만 개별 거래 추이를 "같은 조건"으로 보여 준다
  const homogeneous = useMemo(() => {
    const keys = new Set(list.filter((t) => !t.cancelled && !t.missingSince).map((t) => `${t.complexId}|${areaGroup(t.area)}`))
    return keys.size === 1
  }, [list])

  if (list.length === 0) {
    return (
      <Card>
        <EmptyState />
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader
          title="조회 결과 요약"
          desc={`${formatYm(filter.fromYm)}~${formatYm(filter.toYm)} 계약 · 해제·미확인 ${sum.cancelled}건은 통계에서 제외`}
        />
        <CardBody className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat label="거래 건수" value={`${sum.count.toLocaleString('ko-KR')}건`} sub={`목록 ${list.length.toLocaleString('ko-KR')}건`} />
          <Stat label="중위 거래금액" value={formatPrice(sum.median)} sub={`표본 ${sum.count.toLocaleString('ko-KR')}건`} />
          <Stat label="최고 거래금액" value={formatPrice(sum.max?.price)} sub={tradeSub(sum.max)} />
          <Stat label="최저 거래금액" value={formatPrice(sum.min?.price)} sub={tradeSub(sum.min)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={homogeneous ? '거래금액 추이' : '월별 중위 거래금액 · 거래량'}
          desc={homogeneous ? '같은 단지·같은 면적 거래' : '계약월 기준 · 해제 제외'}
        />
        <CardBody>
          {homogeneous ? <PriceTrendChart trades={list} points={monthly} /> : <MedianVolumeChart points={monthly} />}
          {!homogeneous && (
            <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-muted">
              여러 단지·면적·층의 거래가 섞인 중위값입니다. 같은 조건의 가격 변동으로 읽지 마세요. 단지명과 전용면적으로 조건을 좁히면
              개별 거래 추이를 볼 수 있습니다.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="거래 내역" desc="‘직전 같은 면적 거래 대비’는 조회 기간 안의 같은 단지·같은 면적(±0.5㎡) 직전 거래와 비교한 값입니다" />
        <div className="pt-2">
          <TradeTable trades={list} history={all} />
        </div>
        <p className="num border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
          출처: 국토교통부 아파트 매매 실거래가 상세 자료(공공데이터포털) · 데이터 조회 {formatDateTime(manifest.generatedAt)} · 실거래가는
          신고된 계약 금액이며 현재 매물 호가가 아닙니다.
        </p>
      </Card>
    </>
  )
}

export default function TradesPage() {
  const mres = useManifest()
  return (
    <div>
      <PageTitle title="아파트 실거래가" desc="국토교통부에 신고된 순천시 아파트 매매 계약" />
      <ResourceView res={mres}>
        {(m) =>
          m.status === 'ok' && m.months.length > 0 ? (
            <TradesView manifest={m} />
          ) : (
            <Card>
              <PendingState />
            </Card>
          )
        }
      </ResourceView>
    </div>
  )
}
