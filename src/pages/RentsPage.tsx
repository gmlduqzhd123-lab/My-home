import { useMemo, useState, type ReactNode } from 'react'
import { RentChart } from '@/components/charts'
import { RentTable } from '@/components/RentTable'
import { Card, CardBody, CardHeader, Field, Input, PageTitle, Segmented, Select } from '@/components/ui/primitives'
import { EmptyState, NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { ZoneNote } from '@/components/ZoneNote'
import { ALL_ZONE, ZONES } from '@/config/zones'
import { loadRentMonths, useManifest, useResource } from '@/lib/data'
import { distinctDongs, parseNum } from '@/lib/filters'
import { formatDateTime, formatPrice, formatYm, shiftYm, ymRange } from '@/lib/format'
import { filterRents, rentMonthly, summarizeRents, type RentFilter, type RentKind } from '@/lib/rent'
import { usePrefs } from '@/store/prefs'
import type { Manifest, Rent } from '@/types'

const PRESETS = [
  { value: 3, label: '3개월' },
  { value: 6, label: '6개월' },
  { value: 12, label: '1년' },
  { value: 24, label: '2년' },
]

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-3">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="mono mt-0.5 text-lg font-bold text-ink">{value}</p>
      {sub && <p className="num mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  )
}

function RentsView({ manifest, yms }: { manifest: Manifest; yms: string[] }) {
  const zoneId = usePrefs((s) => s.zoneId)
  const setZone = usePrefs((s) => s.setZone)
  const lastYm = yms[yms.length - 1]
  const firstYm = yms[0]
  const from = (n: number) => (shiftYm(lastYm, -(n - 1)) < firstYm ? firstYm : shiftYm(lastYm, -(n - 1)))
  const [f, setF] = useState<Omit<RentFilter, 'zoneId'>>({
    fromYm: from(12),
    toYm: lastYm,
    dong: '',
    q: '',
    kind: 'all',
    areaMin: null,
    areaMax: null,
    newOnly: false,
  })
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }))
  const want = useMemo(() => yms.filter((ym) => ym >= f.fromYm && ym <= f.toYm), [yms, f.fromYm, f.toYm])
  const res = useResource<Rent[]>(`rents:${want.join(',')}`, () => loadRentMonths(want))
  const preset = PRESETS.find((p) => f.toYm === lastYm && f.fromYm === from(p.value))

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-[12px] font-semibold text-muted">거래 기간 (계약월)</p>
              <Segmented label="거래 기간" value={preset?.value ?? null} options={PRESETS} onChange={(n) => set({ fromYm: from(n), toYm: lastYm })} />
            </div>
            <div>
              <p className="mb-1 text-[12px] font-semibold text-muted">계약 종류</p>
              <Segmented<RentKind>
                label="계약 종류"
                value={f.kind}
                onChange={(kind) => set({ kind })}
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'jeonse', label: '전세' },
                  { value: 'wolse', label: '월세' },
                ]}
              />
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.newOnly} onChange={(e) => set({ newOnly: e.target.checked })} />
              갱신 계약 제외
            </label>
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
            <fieldset>
              <legend className="mb-1 text-[12px] font-semibold text-muted">전용면적 (㎡)</legend>
              <div className="flex items-center gap-1.5">
                <Input inputMode="decimal" aria-label="전용면적 최소" placeholder="최소" value={f.areaMin ?? ''} onChange={(e) => set({ areaMin: parseNum(e.target.value) })} />
                <span className="text-muted">~</span>
                <Input inputMode="decimal" aria-label="전용면적 최대" placeholder="최대" value={f.areaMax ?? ''} onChange={(e) => set({ areaMax: parseNum(e.target.value) })} />
              </div>
            </fieldset>
          </div>
          <ZoneNote zoneId={zoneId} />
        </CardBody>
      </Card>

      <ResourceView res={res} rows={8}>
        {(all) => {
          const list = filterRents(all, { ...f, zoneId })
          if (list.length === 0) {
            return (
              <Card>
                <EmptyState />
              </Card>
            )
          }
          const s = summarizeRents(list)
          return (
            <>
              <Card>
                <CardHeader title="조회 결과 요약" desc={`${formatYm(f.fromYm)}~${formatYm(f.toYm)} 계약`} />
                <CardBody className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <Stat label="전월세 건수" value={`${s.count.toLocaleString('ko-KR')}건`} sub={`갱신 계약 ${s.renewals.toLocaleString('ko-KR')}건 포함`} />
                  <Stat label="전세" value={`${s.jeonse.toLocaleString('ko-KR')}건`} sub={s.medianJeonse != null ? `보증금 중위 ${formatPrice(s.medianJeonse)}` : '해당 없음'} />
                  <Stat label="월세" value={`${s.wolse.toLocaleString('ko-KR')}건`} sub={s.medianMonthly != null ? `월세 중위 ${s.medianMonthly.toLocaleString('ko-KR')}만` : '해당 없음'} />
                  <Stat label="전세 보증금 중위" value={formatPrice(s.medianJeonse)} sub={`표본 ${s.jeonse.toLocaleString('ko-KR')}건`} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="월별 전월세 거래량 · 전세 보증금 중위" desc="계약월 기준" />
                <CardBody>
                  <RentChart points={rentMonthly(list, ymRange(f.fromYm, f.toYm))} />
                  <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-muted">
                    월세는 보증금과 월세의 조합이 계약마다 달라 금액을 한 줄로 비교하기 어렵습니다. 중위값은 참고용이며, 같은 단지·같은 면적의
                    계약을 직접 비교해 보세요.
                  </p>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="전월세 거래 내역" desc="계약일 최신순 · 갱신 계약은 종전 보증금·월세를 함께 표시" />
                <div className="pt-2">
                  <RentTable rents={list} />
                </div>
                <p className="num border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
                  출처: 국토교통부 아파트 전월세 실거래가 자료(공공데이터포털) · 데이터 조회 {formatDateTime(manifest.generatedAt)} · 확정일자 신고
                  기준이며 현재 전월세 매물 시세가 아닙니다.
                </p>
              </Card>
            </>
          )
        }}
      </ResourceView>
    </div>
  )
}

export default function RentsPage() {
  const mres = useManifest()
  return (
    <div>
      <PageTitle title="아파트 전월세 실거래" desc="국토교통부에 신고된 순천시 아파트 전세·월세 계약" />
      <ResourceView res={mres}>
        {(m) => {
          const yms = (m.rentMonths ?? []).map((x) => x.ym).sort()
          const src = m.sources.find((s) => s.id === 'molit-rent')
          if (m.status === 'ok' && yms.length > 0) return <RentsView manifest={m} yms={yms} />
          return (
            <Card>
              {src?.status === 'failed' ? (
                <NotAvailable title="전월세 자료 조회 실패">
                  {m.rentMessage ?? '전월세 자료를 가져오지 못했습니다.'} 공공데이터포털에서 ‘국토교통부_아파트 전월세 실거래가 자료’ 활용신청이 되어
                  있는지 확인해 주세요.
                </NotAvailable>
              ) : (
                <PendingState title="전월세 자료 연결 대기 중">
                  전월세 수집이 아직 실행되지 않았습니다. 공공데이터포털에서 ‘국토교통부_아파트 전월세 실거래가 자료’를 활용신청하면 다음 수집부터
                  표시됩니다.
                </PendingState>
              )}
            </Card>
          )
        }}
      </ResourceView>
    </div>
  )
}
