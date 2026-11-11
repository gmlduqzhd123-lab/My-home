import { Search } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useComplexes } from '@/lib/data'
import { matchesName } from '@/lib/filters'
import { formatPrice } from '@/lib/format'

/** 상단 단지 검색: 입력 시 단지 추천, Enter 는 실거래 검색으로 이동 */
export function HeaderSearch({ className }: { className?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [touched, setTouched] = useState(false)
  const res = useComplexes(touched) // 검색창을 처음 쓸 때 단지 목록을 불러온다
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    if (res.status !== 'ok' || q.trim() === '') return []
    return res.data.filter((c) => matchesName(`${c.name}${c.umdNm}`, q)).slice(0, 8)
  }, [res, q])

  const go = (id: string) => {
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
    navigate(`/complex/${id}`)
  }

  const submit = () => {
    if (active >= 0 && matches[active]) return go(matches[active].id)
    const t = q.trim()
    setOpen(false)
    navigate(t ? `/trades?q=${encodeURIComponent(t)}` : '/trades')
  }

  const showList = open && q.trim() !== ''

  return (
    <div className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/60" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="아파트 단지 검색"
          placeholder="단지명·동 이름 검색"
          autoComplete="off"
          onFocus={() => {
            setTouched(true)
            setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(matches.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(-1, a - 1))
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          className="h-9 w-full rounded-lg border border-white/15 bg-white/10 pr-3 pl-8 text-sm text-white placeholder:text-white/55 focus:bg-white/15"
        />
      </form>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {res.status === 'loading' && <li className="px-3 py-2 text-[13px] text-muted">단지 목록을 불러오는 중…</li>}
          {res.status === 'error' && (
            <li className="px-3 py-2 text-[13px] text-muted">
              {res.error.kind === 'not_found' ? '단지 자료가 아직 없습니다(데이터 연결 대기).' : '단지 목록을 불러오지 못했습니다.'}
            </li>
          )}
          {res.status === 'ok' && matches.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-muted">일치하는 단지가 없습니다. Enter 를 누르면 실거래에서 검색합니다.</li>
          )}
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(c.id)}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left',
                  i === active ? 'bg-accent-soft' : 'hover:bg-surface-2',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                  <span className="block truncate text-[12px] text-muted">{c.address}</span>
                </span>
                {c.lastPrice != null && <span className="num shrink-0 text-[13px] font-semibold text-ink">{formatPrice(c.lastPrice)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
