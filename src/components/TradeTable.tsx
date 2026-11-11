import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { formatArea, formatDate, formatFloor, formatPrice, toPyeong } from '@/lib/format'
import { previousComparable, type PrevComparison } from '@/lib/stats'
import type { Trade } from '@/types'
import { Delta } from './Delta'
import { Badge } from './ui/primitives'
import { Button } from './ui/button'

function TradeBadges({ t }: { t: Trade }) {
  return (
    <>
      {t.cancelled && (
        <Badge tone="up" title={t.cancelDate ? `해제사유 발생일 ${formatDate(t.cancelDate)}` : undefined}>
          해제{t.cancelDate ? ` ${formatDate(t.cancelDate).slice(5)}` : ''}
        </Badge>
      )}
      {t.missingSince && (
        <Badge tone="warn" title="최근 조회에서 더 이상 확인되지 않는 거래입니다. 정정되었을 수 있어 통계에서 제외합니다.">
          최근 조회 미확인
        </Badge>
      )}
      {t.dealType === '직거래' && <Badge tone="neutral">직거래</Badge>}
      {(t.buyer === '법인' || t.seller === '법인') && (
        <Badge tone="neutral" title={`매도 ${t.seller ?? '-'} → 매수 ${t.buyer ?? '-'}`}>
          법인
        </Badge>
      )}
      {t.landLease && <Badge tone="neutral">토지임대부</Badge>}
    </>
  )
}

function PrevCell({ cmp }: { cmp: PrevComparison | null }) {
  if (!cmp) return <span className="text-[12px] text-muted">비교 거래 없음</span>
  return (
    <span className="inline-flex flex-col items-end">
      <Delta diff={cmp.diff} pct={cmp.pct} />
      <span className="num text-[11px] text-muted">
        {formatDate(cmp.prev.dealDate)} · {formatFloor(cmp.prev.floor)}
        {cmp.floorDiffers && ' (층 다름)'}
      </span>
    </span>
  )
}

const PAGE = 50

/**
 * 거래 목록. 넓은 화면은 표, 좁은 화면은 카드.
 * history: 직전 동일면적 거래 비교에 쓸 거래 집합(같은 단지의 과거 거래가 들어 있어야 함)
 */
export function TradeTable({
  trades,
  history,
  showComplex = true,
  historyLabel = '직전 같은 면적 거래 대비',
}: {
  trades: Trade[]
  history?: Trade[]
  showComplex?: boolean
  historyLabel?: string
}) {
  const [limit, setLimit] = useState(PAGE)
  const byComplex = useMemo(() => {
    const m = new Map<string, Trade[]>()
    for (const t of history ?? []) {
      const a = m.get(t.complexId)
      if (a) a.push(t)
      else m.set(t.complexId, [t])
    }
    return m
  }, [history])

  const rows = trades.slice(0, limit)
  const cmpOf = (t: Trade) => (history && !t.cancelled && !t.missingSince ? previousComparable(t, byComplex.get(t.complexId) ?? []) : null)
  const dim = (t: Trade) => (t.cancelled || t.missingSince ? 'text-muted line-through decoration-muted/60' : '')

  return (
    <div>
      {/* 표 (md 이상) */}
      <div className="hidden overflow-x-auto md:block" tabIndex={0} role="group" aria-label="가로로 스크롤할 수 있는 표">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">아파트 매매 실거래 목록</caption>
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">계약일</th>
              {showComplex && <th scope="col" className="px-2 py-2.5 font-semibold">단지 · 법정동</th>}
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">전용면적</th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">층</th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">거래금액</th>
              {history && <th scope="col" className="px-2 py-2.5 text-right font-semibold">{historyLabel}</th>}
              <th scope="col" className="px-4 py-2.5 font-semibold">구분</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-line/70 last:border-0 hover:bg-surface-2/60">
                <td className="num px-4 py-2.5 whitespace-nowrap text-ink">{formatDate(t.dealDate)}</td>
                {showComplex && (
                  <td className="px-2 py-2.5">
                    <Link to={`/complex/${t.complexId}`} className="font-semibold text-ink hover:text-accent-ink hover:underline">
                      {t.aptNm}
                    </Link>
                    <span className="ml-1.5 text-[12px] text-muted">{t.umdNm}</span>
                  </td>
                )}
                <td className="num px-2 py-2.5 text-right whitespace-nowrap">
                  {formatArea(t.area)}
                  <span className="ml-1 text-[11px] text-muted">({toPyeong(t.area)}평)</span>
                </td>
                <td className="num px-2 py-2.5 text-right whitespace-nowrap">{formatFloor(t.floor)}</td>
                <td className={cn('num px-2 py-2.5 text-right font-bold whitespace-nowrap', dim(t))}>{formatPrice(t.price)}</td>
                {history && (
                  <td className="px-2 py-2.5 text-right">
                    <PrevCell cmp={cmpOf(t)} />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    <TradeBadges t={t} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 카드 (모바일) */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((t) => {
          const cmp = cmpOf(t)
          return (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {showComplex && (
                    <Link to={`/complex/${t.complexId}`} className="block truncate text-[15px] font-bold text-ink">
                      {t.aptNm}
                    </Link>
                  )}
                  <p className="num text-[12px] text-muted">
                    {showComplex && `${t.umdNm} · `}
                    {formatArea(t.area)} · {formatFloor(t.floor)} · {formatDate(t.dealDate)} 계약
                  </p>
                </div>
                <p className={cn('num shrink-0 text-[15px] font-bold', dim(t))}>{formatPrice(t.price)}</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap gap-1">
                  <TradeBadges t={t} />
                </span>
                {cmp && (
                  <span className="num flex items-center gap-1 text-[11px] text-muted">
                    직전 같은 면적 대비 <Delta diff={cmp.diff} />
                    {cmp.floorDiffers && '(층 다름)'}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {trades.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button onClick={() => setLimit((l) => l + PAGE)}>
            더 보기 ({limit.toLocaleString('ko-KR')} / {trades.length.toLocaleString('ko-KR')}건)
          </Button>
        </div>
      )}
    </div>
  )
}
