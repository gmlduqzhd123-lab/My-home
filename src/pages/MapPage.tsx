import { ChevronDown, ChevronUp, MapPinOff, SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CompareButton, FavoriteButton } from '@/components/ComplexActions'
import { ComplexMap, type MapStatus } from '@/components/ComplexMap'
import { Button } from '@/components/ui/button'
import { Badge, Input, Select } from '@/components/ui/primitives'
import { EmptyState, PendingState, ResourceView } from '@/components/ui/states'
import { ZoneNote } from '@/components/ZoneNote'
import { ALL_ZONE, ZONES } from '@/config/zones'
import { cn } from '@/lib/cn'
import { useComplexes, useManifest } from '@/lib/data'
import { emptyComplexFilter, filterComplexes, parseNum, type ComplexFilter } from '@/lib/filters'
import { formatDate, formatPrice } from '@/lib/format'
import { usePrefs } from '@/store/prefs'
import type { Complex } from '@/types'

function ComplexPeek({ c, onClose }: { c: Complex; onClose: () => void }) {
  return (
    <section aria-label={`${c.name} 요약`} className="border-b border-line bg-accent-soft/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold text-ink">{c.name}</h2>
          <p className="text-[12px] text-muted">{c.address}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="선택 해제" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>
      <dl className="num mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="text-muted">최근 실거래</dt>
          <dd className="text-sm font-bold text-ink">{c.lastPrice != null ? formatPrice(c.lastPrice) : '거래 없음'}</dd>
          {c.lastDealDate && (
            <dd className="text-[11px] text-muted">
              {formatDate(c.lastDealDate)} · {c.lastArea}㎡
            </dd>
          )}
        </div>
        <div>
          <dt className="text-muted">준공연도</dt>
          <dd className="text-sm font-bold text-ink">{c.buildYear ?? '확인 불가'}</dd>
        </div>
        <div>
          <dt className="text-muted">수집 기간 거래</dt>
          <dd className="text-sm font-bold text-ink">{c.tradeCount}건</dd>
        </div>
      </dl>
      {c.lat == null && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-warn">
          <MapPinOff className="size-3.5" aria-hidden="true" /> 좌표가 확인되지 않아 지도에 표시되지 않습니다.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="primary" size="sm">
          <Link to={`/complex/${c.id}`}>상세 보기</Link>
        </Button>
        <FavoriteButton id={c.id} name={c.name} size="sm" />
        <CompareButton id={c.id} name={c.name} size="sm" />
      </div>
    </section>
  )
}

function MapView({ complexes }: { complexes: Complex[] }) {
  const zoneId = usePrefs((s) => s.zoneId)
  const setZone = usePrefs((s) => s.setZone)
  const [f, setF] = useState<ComplexFilter>(emptyComplexFilter)
  const [showFilter, setShowFilter] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading')
  const [sheetOpen, setSheetOpen] = useState(false)
  const mapOk = mapStatus === 'ready' || mapStatus === 'loading'

  const filter = useMemo(() => ({ ...f, zoneId }), [f, zoneId])
  const list = useMemo(() => filterComplexes(complexes, filter), [complexes, filter])
  const withCoord = list.filter((c) => c.lat != null).length
  const selected = complexes.find((c) => c.id === selectedId) ?? null
  const set = (patch: Partial<ComplexFilter>) => setF((cur) => ({ ...cur, ...patch }))
  const num = (k: keyof ComplexFilter, label: string, ph: string) => (
    <Input inputMode="numeric" aria-label={label} placeholder={ph} value={(f[k] as number | null) ?? ''} onChange={(e) => set({ [k]: parseNum(e.target.value) })} />
  )

  const panel = (
    <>
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex gap-2">
          <Input type="search" aria-label="단지 검색" placeholder="단지명·동 이름" value={f.q} onChange={(e) => set({ q: e.target.value })} />
          <Select aria-label="생활권" className="w-32 shrink-0" value={zoneId} onChange={(e) => setZone(e.target.value)}>
            <option value={ALL_ZONE}>전체</option>
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
          <Button size="icon" variant={showFilter ? 'soft' : 'outline'} aria-label="상세 조건" aria-expanded={showFilter} onClick={() => setShowFilter((v) => !v)} className="shrink-0">
            <SlidersHorizontal />
          </Button>
        </div>
        {showFilter && (
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1.5 text-[12px] font-semibold text-muted">
            <span>최근 거래금액(만원)</span>
            {num('priceMin', '최근 거래금액 최소', '최소')}
            {num('priceMax', '최근 거래금액 최대', '최대')}
            <span>전용면적(㎡)</span>
            {num('areaMin', '전용면적 최소', '최소')}
            {num('areaMax', '전용면적 최대', '최대')}
            <span>준공연도</span>
            {num('yearMin', '준공연도 시작', '부터')}
            {num('yearMax', '준공연도 끝', '까지')}
          </div>
        )}
        <ZoneNote zoneId={zoneId} />
        <p className="num text-[12px] text-muted" role="status">
          단지 {list.length.toLocaleString('ko-KR')}곳 · 좌표 확인 {withCoord.toLocaleString('ko-KR')}곳
          {list.length - withCoord > 0 && ` · 좌표 미확인 ${(list.length - withCoord).toLocaleString('ko-KR')}곳(목록에만 표시)`}
        </p>
      </div>
      {selected && <ComplexPeek c={selected} onClose={() => setSelectedId(null)} />}
      {list.length === 0 ? (
        <EmptyState className="py-8" />
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, 300).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-current={c.id === selectedId}
                onClick={() => {
                  setSelectedId(c.id)
                  setSheetOpen(true)
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2/60',
                  c.id === selectedId && 'bg-accent-soft/60',
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{c.name}</span>
                    {c.lat == null && <Badge tone="warn">좌표 미확인</Badge>}
                  </span>
                  <span className="num block truncate text-[12px] text-muted">
                    {c.umdNm}
                    {c.buildYear && ` · ${c.buildYear}년`} · 거래 {c.tradeCount}건
                  </span>
                </span>
                <span className="num shrink-0 text-right">
                  <span className="block text-sm font-bold text-ink">{c.lastPrice != null ? formatPrice(c.lastPrice) : '-'}</span>
                  {c.lastDealDate && <span className="block text-[11px] text-muted">{formatDate(c.lastDealDate)}</span>}
                </span>
              </button>
            </li>
          ))}
          {list.length > 300 && <li className="px-4 py-3 text-center text-[12px] text-muted">검색 조건을 좁히면 나머지 단지를 볼 수 있습니다.</li>}
        </ul>
      )}
    </>
  )

  return (
    <div className="relative h-[calc(100dvh-7rem)] lg:grid lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[380px_1fr]">
      {/* 데스크톱: 왼쪽 목록 */}
      <div className="hidden overflow-y-auto border-r border-line bg-surface lg:block">{panel}</div>

      {/* 지도 (모바일: 전체 화면 / 지도 사용 불가 시 모바일에서는 숨김) */}
      <ComplexMap
        complexes={list}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id)
          setSheetOpen(true)
        }}
        onStatus={setMapStatus}
        fitKey={list.map((c) => c.id).join(',')}
        className={cn('h-full', mapOk ? 'absolute inset-0 lg:relative lg:inset-auto' : 'hidden lg:block')}
      />

      {/* 모바일: 지도 위 하단 시트 / 지도 불가 시 일반 목록 */}
      {mapOk ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-[0_-6px_24px_rgba(0,0,0,.12)] transition-[height] duration-300 lg:hidden',
            sheetOpen ? 'h-[72%]' : 'h-[58px]',
          )}
        >
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            className="flex h-[58px] w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-1"
          >
            <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            <span className="flex items-center gap-1 text-[13px] font-bold text-ink">
              {selected ? selected.name : `단지 ${list.length.toLocaleString('ko-KR')}곳`}
              {sheetOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              <span className="sr-only">{sheetOpen ? '목록 접기' : '목록 펼치기'}</span>
            </span>
          </button>
          <div className={cn('flex-1 overflow-y-auto', !sheetOpen && 'hidden')}>{panel}</div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto bg-surface pb-16 lg:hidden">
          <p className="flex items-start gap-1.5 bg-warn-soft px-4 py-2 text-[12px] font-medium text-warn" role="status">
            <MapPinOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            지도를 불러오지 못했습니다. 단지 목록으로 탐색할 수 있습니다.
          </p>
          {panel}
        </div>
      )}
    </div>
  )
}

export default function MapPage() {
  const mres = useManifest()
  const ready = mres.status === 'ok' && mres.data.status === 'ok'
  const cres = useComplexes(ready)
  if (mres.status === 'ok' && !ready) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-line bg-surface">
          <PendingState />
        </div>
      </div>
    )
  }
  if (mres.status === 'error') return <ResourceView res={mres}>{() => null}</ResourceView>
  return <ResourceView res={cres}>{(list) => <MapView complexes={list} />}</ResourceView>
}
