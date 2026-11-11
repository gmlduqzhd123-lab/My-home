import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'

/** 금액 차이 표시: 상승 빨강 ▲ / 하락 파랑 ▼ — 색에만 의존하지 않도록 아이콘·부호·텍스트를 함께 표시 */
export function Delta({ diff, pct, className }: { diff: number; pct?: number; className?: string }) {
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
  const label = dir === 'up' ? '상승' : dir === 'down' ? '하락' : '변동 없음'
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 text-[13px] font-semibold',
        dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-muted',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {dir === 'flat' ? '0' : `${diff > 0 ? '+' : '-'}${formatPrice(Math.abs(diff))}`}
      {pct != null && dir !== 'flat' && <span className="font-medium">({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
    </span>
  )
}
