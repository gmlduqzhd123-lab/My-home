import { Download, GitCompareArrows, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FavoriteButton } from '@/components/ComplexActions'
import { ComplexPicker } from '@/components/ComplexPicker'
import { TradeTable } from '@/components/TradeTable'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, PageTitle } from '@/components/ui/primitives'
import { NotAvailable, PendingState, ResourceView } from '@/components/ui/states'
import { ZONES } from '@/config/zones'
import { cn } from '@/lib/cn'
import { loadBriefing, useComplexes, useManifest, useResource } from '@/lib/data'
import { formatDate, formatPrice } from '@/lib/format'
import { exportSaved, MAX_COMPARE, parseSaved, usePrefs } from '@/store/prefs'
import type { Complex } from '@/types'

function SavedDataCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const doExport = () => {
    const s = usePrefs.getState()
    const blob = new Blob([exportSaved(s)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `suncheon-zip-관심단지-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ ok: true, text: `관심 단지 ${s.favorites.length}곳을 파일로 내보냈습니다.` })
  }

  const doImport = async (file: File) => {
    try {
      const data = parseSaved(await file.text())
      usePrefs.getState().replaceSaved(data)
      setMsg({ ok: true, text: `관심 단지 ${data.favorites.length}곳, 관심 지역 ${data.favoriteZones.length}곳을 가져왔습니다.` })
    } catch (e) {
      setMsg({ ok: false, text: `가져오기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}` })
    }
  }

  return (
    <Card>
      <CardHeader title="저장 데이터 내보내기 · 가져오기" desc="관심 단지는 이 기기의 브라우저에만 저장됩니다. 기기 간 자동 동기화는 지원하지 않습니다" />
      <CardBody className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button onClick={doExport}>
            <Download /> 파일로 내보내기
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload /> 파일에서 가져오기
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="관심 단지 파일 선택"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="text-[12px] text-muted">가져오기를 하면 현재 저장된 관심 단지·관심 지역·비교 목록이 파일 내용으로 바뀝니다.</p>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={cn('text-[13px] font-semibold', msg.ok ? 'text-accent-ink' : 'text-up')}>
            {msg.text}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function FavoriteZones() {
  const favZones = usePrefs((s) => s.favoriteZones)
  const toggle = usePrefs((s) => s.toggleFavoriteZone)
  const setZone = usePrefs((s) => s.setZone)
  const navigate = useNavigate()
  return (
    <Card>
      <CardHeader title="관심 지역" desc="눌러서 저장·해제합니다. 저장한 지역은 아래에서 바로 실거래를 열 수 있습니다" />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {ZONES.map((z) => {
            const on = favZones.includes(z.id)
            return (
              <button
                key={z.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(z.id)}
                className={cn(
                  'h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold',
                  on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink',
                )}
              >
                {z.name}
              </button>
            )
          })}
        </div>
        {favZones.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {ZONES.filter((z) => favZones.includes(z.id)).map((z) => (
              <Button
                key={z.id}
                size="sm"
                variant="soft"
                onClick={() => {
                  setZone(z.id)
                  navigate('/trades')
                }}
              >
                {z.name} 실거래 보기
              </Button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function FavoriteList({ complexes }: { complexes: Complex[] }) {
  const favorites = usePrefs((s) => s.favorites)
  const toggle = usePrefs((s) => s.toggleFavorite)
  const setCompare = usePrefs((s) => s.setCompare)
  const navigate = useNavigate()
  const briefing = useResource('briefing', loadBriefing)
  const favs = favorites.map((id) => complexes.find((c) => c.id === id)).filter((c): c is Complex => !!c)
  const unknown = favorites.length - favs.length
  const newTrades = briefing.status === 'ok' ? briefing.data.newTrades.filter((t) => favorites.includes(t.complexId)) : []

  return (
    <>
      <Card>
        <CardHeader
          title={`관심 단지 ${favs.length}곳`}
          action={
            favs.length >= 2 ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setCompare(favs.slice(0, MAX_COMPARE).map((c) => c.id))
                  navigate('/compare')
                }}
              >
                <GitCompareArrows /> {favs.length > MAX_COMPARE ? `앞의 ${MAX_COMPARE}곳 비교` : '관심 단지 비교'}
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-3">
          <ComplexPicker complexes={complexes} exclude={favorites} onPick={toggle} placeholder="관심 단지로 추가할 단지 검색" />
          {unknown > 0 && <p className="text-[12px] text-warn">저장된 관심 단지 {unknown}곳은 현재 수집 자료에서 찾을 수 없어 표시하지 않았습니다.</p>}
        </CardBody>
        {favs.length === 0 ? (
          <NotAvailable title="저장된 관심 단지가 없습니다" className="py-8">
            위 검색창이나 단지 상세·지도 화면의 하트 버튼으로 추가하세요.
          </NotAvailable>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {favs.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Link to={`/complex/${c.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink hover:underline">{c.name}</span>
                  <span className="num block truncate text-[12px] text-muted">
                    {c.umdNm}
                    {c.lastDealDate ? ` · 최근 거래 ${formatDate(c.lastDealDate)} · ${c.lastArea}㎡` : ' · 수집 기간 내 거래 없음'}
                  </span>
                </Link>
                <span className="num shrink-0 text-sm font-bold text-ink">{c.lastPrice != null ? formatPrice(c.lastPrice) : '-'}</span>
                <FavoriteButton id={c.id} name={c.name} iconOnly />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {favs.length > 0 && (
        <Card>
          <CardHeader
            title="관심 단지에서 최근 확인된 실거래"
            desc={briefing.status === 'ok' ? `브리핑 기준일 ${formatDate(briefing.data.date)}에 새로 확인된 거래` : undefined}
            action={newTrades.length > 0 ? <Badge tone="accent">{newTrades.length}건</Badge> : undefined}
          />
          <div className="pt-2">
            <ResourceView res={briefing} rows={2}>
              {(b) =>
                b.status === 'failed' ? (
                  <NotAvailable title="조회 실패" className="py-6">
                    최근 수집이 실패해 새 거래를 확인하지 못했습니다.
                  </NotAvailable>
                ) : newTrades.length ? (
                  <TradeTable trades={newTrades} />
                ) : (
                  <NotAvailable title="새로 확인된 거래 없음" className="py-6">
                    관심 단지에서 이번 갱신에 새로 확인된 거래가 없습니다. 각 단지의 전체 거래는 단지 상세에서 볼 수 있습니다.
                  </NotAvailable>
                )
              }
            </ResourceView>
          </div>
        </Card>
      )}
    </>
  )
}

export default function FavoritesPage() {
  const mres = useManifest()
  const ready = mres.status === 'ok' && mres.data.status === 'ok'
  const cres = useComplexes(ready)
  return (
    <div className="space-y-4">
      <PageTitle title="관심 아파트" desc="로그인 없이 이 기기에 저장됩니다" />
      {mres.status === 'ok' && !ready ? (
        <Card>
          <PendingState />
        </Card>
      ) : (
        <ResourceView res={mres}>{() => <ResourceView res={cres}>{(list) => <FavoriteList complexes={list} />}</ResourceView>}</ResourceView>
      )}
      <FavoriteZones />
      <SavedDataCard />
    </div>
  )
}
