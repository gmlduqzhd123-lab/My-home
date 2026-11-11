import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatArea, formatDate, formatFloor, formatPrice } from '@/lib/format'
import { isJeonse } from '@/lib/rent'
import type { Rent } from '@/types'
import { Button } from './ui/button'
import { Badge } from './ui/primitives'

function Amount({ r }: { r: Rent }) {
  return isJeonse(r) ? (
    <>
      <Badge tone="accent">전세</Badge> <span className="font-bold">{formatPrice(r.deposit)}</span>
    </>
  ) : (
    <>
      <Badge>월세</Badge> <span className="font-bold">{formatPrice(r.deposit)}</span>
      <span className="text-muted"> / </span>
      <span className="font-bold">{r.monthly.toLocaleString('ko-KR')}만</span>
    </>
  )
}

function Prev({ r }: { r: Rent }) {
  if (r.prevDeposit == null && r.prevMonthly == null) return null
  return (
    <span className="num block text-[11px] text-muted">
      종전 {formatPrice(r.prevDeposit ?? 0)}
      {r.prevMonthly ? ` / ${r.prevMonthly.toLocaleString('ko-KR')}만` : ''}
    </span>
  )
}

function Tags({ r }: { r: Rent }) {
  return (
    <>
      {r.contractType && <Badge tone={r.contractType === '갱신' ? 'warn' : 'neutral'}>{r.contractType}</Badge>}
      {r.useRenewal && <Badge tone="warn" title="계약갱신요구권 사용">갱신요구권</Badge>}
      {r.missingSince && <Badge tone="warn">최근 조회 미확인</Badge>}
    </>
  )
}

const PAGE = 50

/** 전월세 거래 목록. 넓은 화면은 표, 좁은 화면은 카드. */
export function RentTable({ rents, showComplex = true }: { rents: Rent[]; showComplex?: boolean }) {
  const [limit, setLimit] = useState(PAGE)
  const rows = rents.slice(0, limit)
  return (
    <div>
      <div className="hidden overflow-x-auto md:block" tabIndex={0} role="group" aria-label="가로로 스크롤할 수 있는 표">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">아파트 전월세 실거래 목록</caption>
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">계약일</th>
              {showComplex && <th scope="col" className="px-2 py-2.5 font-semibold">단지 · 법정동</th>}
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">전용면적</th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">층</th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">보증금 / 월세</th>
              <th scope="col" className="px-2 py-2.5 font-semibold">계약기간</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">구분</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/70 last:border-0 hover:bg-surface-2/60">
                <td className="num px-4 py-2.5 whitespace-nowrap">{formatDate(r.dealDate)}</td>
                {showComplex && (
                  <td className="px-2 py-2.5">
                    <Link to={`/complex/${r.complexId}`} className="font-semibold text-ink hover:text-accent-ink hover:underline">
                      {r.aptNm}
                    </Link>
                    <span className="ml-1.5 text-[12px] text-muted">{r.umdNm}</span>
                  </td>
                )}
                <td className="num px-2 py-2.5 text-right whitespace-nowrap">{formatArea(r.area)}</td>
                <td className="num px-2 py-2.5 text-right whitespace-nowrap">{formatFloor(r.floor)}</td>
                <td className="num px-2 py-2.5 text-right whitespace-nowrap">
                  <Amount r={r} />
                  <Prev r={r} />
                </td>
                <td className="num px-2 py-2.5 text-[12px] whitespace-nowrap text-muted">{r.contractTerm ?? '-'}</td>
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    <Tags r={r} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {showComplex && (
                  <Link to={`/complex/${r.complexId}`} className="block truncate text-[15px] font-bold text-ink">
                    {r.aptNm}
                  </Link>
                )}
                <p className="num text-[12px] text-muted">
                  {showComplex && `${r.umdNm} · `}
                  {formatArea(r.area)} · {formatFloor(r.floor)} · {formatDate(r.dealDate)} 계약
                </p>
              </div>
              <p className="num shrink-0 text-right text-[14px]">
                <Amount r={r} />
                <Prev r={r} />
              </p>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Tags r={r} />
            </div>
          </li>
        ))}
      </ul>

      {rents.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button onClick={() => setLimit((l) => l + PAGE)}>
            더 보기 ({limit.toLocaleString('ko-KR')} / {rents.length.toLocaleString('ko-KR')}건)
          </Button>
        </div>
      )}
    </div>
  )
}
