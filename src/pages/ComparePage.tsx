import { AlertTriangle, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CompareChart, SERIES } from '@/components/charts'
import { ComplexPicker } from '@/components/ComplexPicker'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, Field, PageTitle, Segmented, Select } from '@/components/ui/primitives'
import { NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { areaOptions, buildCompareRow, compareWarnings, type AreaMode, type CompareRow } from '@/lib/compare'
import { complexFacts } from '@/lib/facts'
import { loadComplexTrades, useComplexes, useManifest, useResource } from '@/lib/data'
import { formatDate, formatFloor, formatPrice, formatYm, shiftYm, ymRange } from '@/lib/format'
import { MAX_COMPARE, usePrefs } from '@/store/prefs'
import type { Complex, Manifest, Trade } from '@/types'

const NA = <span className="text-[12px] font-normal text-muted">자료 확인 불가</span>

function Table({ rows }: { rows: CompareRow[] }) {
  const line = (label: string, cell: (r: CompareRow) => ReactNode, note?: string) => (
    <tr className="border-b border-line/70 last:border-0">
      <th scope="row" className="sticky left-0 bg-surface px-4 py-2.5 text-left text-[12px] font-semibold whitespace-nowrap text-muted">
        {label}
        {note && <span className="block text-[11px] font-normal">{note}</span>}
      </th>
      {rows.map((r) => (
        <td key={r.complex.id} className="num px-3 py-2.5 text-sm font-semibold text-ink">
          {cell(r) ?? NA}
        </td>
      ))}
    </tr>
  )
  return (
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="가로로 스크롤할 수 있는 표">
      <table className="w-full min-w-[560px]">
        <caption className="sr-only">단지 비교 표</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky left-0 bg-surface px-4 py-2.5 text-left text-[12px] font-semibold text-muted">항목</th>
            {rows.map((r, i) => (
              <th key={r.complex.id} scope="col" className="px-3 py-2.5 text-left">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-4 rounded-full" style={{ background: SERIES[i % SERIES.length].color }} aria-hidden="true" />
                  <Link to={`/complex/${r.complex.id}`} className="text-sm font-bold text-ink hover:underline">
                    {r.complex.name}
                  </Link>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {line('위치', (r) => r.complex.address)}
          {line('준공연도', (r) => (r.complex.buildYear ? `${r.complex.buildYear}년` : null))}
          {line('세대수', (r) => {
            const n = complexFacts(r.complex).households
            return n != null ? `${n.toLocaleString('ko-KR')}세대` : null
          })}
          {line('비교 전용면적', (r) => (r.area != null ? `${r.area}㎡` : <span className="text-[12px] font-normal text-muted">기간 내 거래 없음</span>))}
          {line('거래 건수', (r) => `${r.summary.count}건`, '해제 제외')}
          {line('기간 중위 거래금액', (r) => (r.summary.median != null ? formatPrice(r.summary.median) : <span className="text-[12px] font-normal text-muted">거래 없음</span>))}
          {line('최근 실거래가', (r) =>
            r.last ? (
              <>
                {formatPrice(r.last.price)}
                <span className="block text-[11px] font-normal text-muted">
                  {formatDate(r.last.dealDate)} · {formatFloor(r.last.floor)}
                </span>
              </>
            ) : (
              <span className="text-[12px] font-normal text-muted">거래 없음</span>
            ),
          )}
          {line('최고 / 최저', (r) => (r.summary.max && r.summary.min ? `${formatPrice(r.summary.max.price)} / ${formatPrice(r.summary.min.price)}` : null))}
          {line('주차대수', (r) => {
            const n = complexFacts(r.complex).parking
            return n != null ? `${n.toLocaleString('ko-KR')}대` : null
          })}
          {line('용적률', (r) => {
            const n = complexFacts(r.complex).floorAreaRatio
            return n != null ? `${n}%` : null
          })}
          {line('난방방식', (r) => r.complex.kapt?.heating ?? null)}
          {line('관리비', () => null, '미연계')}
          {line('교육·편의시설', (r) => {
            const k = r.complex.kapt
            const txt = [k?.education, k?.convenient].filter(Boolean).join(' / ')
            return txt ? <span className="text-[12px] font-normal whitespace-normal">{txt}</span> : null
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompareView({ manifest, complexes }: { manifest: Manifest; complexes: Complex[] }) {
  const ids = usePrefs((s) => s.compare)
  const add = usePrefs((s) => s.addCompare)
  const remove = usePrefs((s) => s.removeCompare)
  const clear = usePrefs((s) => s.clearCompare)
  const [months, setMonths] = useState(12)
  const [mode, setMode] = useState<AreaMode>('top')

  const selected = useMemo(() => ids.map((id) => complexes.find((c) => c.id === id)).filter((c): c is Complex => !!c), [ids, complexes])
  const key = selected.map((c) => c.id).join(',')
  const tres = useResource<Trade[][]>(selected.length ? `compare:${key}` : null, () => Promise.all(selected.map((c) => loadComplexTrades(c.id))))

  const allYms = manifest.months.map((m) => m.ym).sort()
  const toYm = allYms[allYms.length - 1]
  const fromYm = months === 0 || shiftYm(toYm, -(months - 1)) < allYms[0] ? allYms[0] : shiftYm(toYm, -(months - 1))
  const yms = useMemo(() => ymRange(fromYm, toYm), [fromYm, toYm])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`비교 단지 ${selected.length} / ${MAX_COMPARE}`}
          desc="단지를 추가하거나 빼면 결과가 바로 바뀝니다"
          action={
            selected.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={clear}>
                모두 빼기
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-3">
          {selected.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {selected.map((c, i) => (
                <li key={c.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-1 pl-3 text-sm font-semibold text-ink">
                  <span className="size-2 rounded-full" style={{ background: SERIES[i % SERIES.length].color }} aria-hidden="true" />
                  {c.name}
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    aria-label={`${c.name} 비교에서 빼기`}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected.length < MAX_COMPARE ? (
            <ComplexPicker complexes={complexes} exclude={ids} onPick={(id) => add(id)} placeholder="비교할 단지 검색 (단지명·동)" />
          ) : (
            <p className="text-[13px] text-muted">최대 {MAX_COMPARE}개까지 비교할 수 있습니다. 다른 단지를 넣으려면 하나를 먼저 빼 주세요.</p>
          )}
        </CardBody>
      </Card>

      {selected.length === 0 ? (
        <Card>
          <NotAvailable title="비교할 단지를 추가하세요">위 검색창에서 단지를 찾거나, 단지 상세·지도 화면의 ‘비교 담기’를 눌러 추가할 수 있습니다.</NotAvailable>
        </Card>
      ) : (
        <ResourceView res={tres} rows={6} pendingWhenMissing={false}>
          {(lists) => {
            const options = areaOptions(lists)
            const effMode: AreaMode = mode !== 'top' && !options.includes(mode) ? 'top' : mode
            const rows = selected.map((c, i) => buildCompareRow(c, lists[i] ?? [], fromYm, toYm, effMode, yms))
            const warnings = compareWarnings(rows)
            return (
              <>
                <Card>
                  <CardBody className="flex flex-wrap items-end gap-3">
                    <div>
                      <p className="mb-1 text-[12px] font-semibold text-muted">비교 대상 거래기간</p>
                      <Segmented
                        label="비교 기간"
                        value={months}
                        onChange={setMonths}
                        options={[
                          { value: 6, label: '6개월' },
                          { value: 12, label: '1년' },
                          { value: 24, label: '2년' },
                          { value: 0, label: '전체' },
                        ]}
                      />
                    </div>
                    <Field label="비교 전용면적" className="w-56">
                      <Select value={String(effMode)} onChange={(e) => setMode(e.target.value === 'top' ? 'top' : Number(e.target.value))}>
                        <option value="top">단지별 최다 거래 면적</option>
                        {options.map((a) => (
                          <option key={a} value={a}>
                            {a}㎡ (모든 단지 동일)
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <p className="num text-[12px] text-muted">
                      {formatYm(fromYm)}~{formatYm(toYm)} 계약분
                    </p>
                  </CardBody>
                </Card>

                {warnings.length > 0 && (
                  <div role="note" className="space-y-1 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
                    <p className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="size-4" aria-hidden="true" /> 비교 조건 주의
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Card>
                  <CardHeader title="비교 표" />
                  <div className="pt-2">
                    <Table rows={rows} />
                  </div>
                </Card>

                <Card>
                  <CardHeader title="월 중위 거래금액 비교" desc="비교 전용면적 기준 · 해제 제외" />
                  <CardBody>
                    <CompareChart yms={yms} series={rows.map((r) => ({ id: r.complex.id, name: `${r.complex.name}${r.area != null ? ` ${r.area}㎡` : ''}`, points: r.monthly }))} />
                  </CardBody>
                </Card>
              </>
            )
          }}
        </ResourceView>
      )}
    </div>
  )
}

export default function ComparePage() {
  const mres = useManifest()
  const ready = mres.status === 'ok' && mres.data.status === 'ok'
  const cres = useComplexes(ready)
  return (
    <div>
      <PageTitle title="아파트 비교" desc={`최대 ${MAX_COMPARE}개 단지를 같은 기준으로 나란히 봅니다`} />
      <ResourceView res={mres}>
        {(m) =>
          m.status === 'ok' ? (
            <ResourceView res={cres}>{(list) => <CompareView manifest={m} complexes={list} />}</ResourceView>
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
