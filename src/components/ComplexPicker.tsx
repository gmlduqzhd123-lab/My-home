import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { matchesName } from '@/lib/filters'
import { formatPrice } from '@/lib/format'
import type { Complex } from '@/types'
import { Input } from './ui/primitives'

/** 단지 검색 후 선택(비교·관심 추가용) */
export function ComplexPicker({
  complexes,
  exclude,
  onPick,
  disabled,
  placeholder = '추가할 단지 검색',
}: {
  complexes: Complex[]
  exclude: string[]
  onPick: (id: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const matches = useMemo(
    () => (q.trim() ? complexes.filter((c) => !exclude.includes(c.id) && matchesName(`${c.name}${c.umdNm}`, q)).slice(0, 6) : []),
    [complexes, exclude, q],
  )
  return (
    <div>
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} />
      {q.trim() !== '' && (
        <ul className="mt-1.5 divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="검색된 단지">
          {matches.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">일치하는 단지가 없습니다.</li>}
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(c.id)
                  setQ('')
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                  <span className="num block truncate text-[12px] text-muted">
                    {c.umdNm} · 최근 {c.lastPrice != null ? formatPrice(c.lastPrice) : '거래 없음'}
                  </span>
                </span>
                <Plus className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
