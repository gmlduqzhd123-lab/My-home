import { GitCompareArrows, Heart } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { MAX_COMPARE, usePrefs } from '@/store/prefs'
import { Button, type ButtonProps } from './ui/button'

export function FavoriteButton({ id, name, size = 'md', iconOnly }: { id: string; name: string; size?: ButtonProps['size']; iconOnly?: boolean }) {
  const on = usePrefs((s) => s.favorites.includes(id))
  const toggle = usePrefs((s) => s.toggleFavorite)
  return (
    <Button
      size={iconOnly ? 'icon' : size}
      variant={on ? 'soft' : 'outline'}
      aria-pressed={on}
      aria-label={`${name} ${on ? '관심 단지 해제' : '관심 단지 추가'}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(id)
      }}
      className={cn(iconOnly && 'size-9')}
    >
      <Heart className={cn(on && 'fill-current')} aria-hidden="true" />
      {!iconOnly && (on ? '관심 단지' : '관심 추가')}
    </Button>
  )
}

export function CompareButton({ id, name, size = 'md' }: { id: string; name: string; size?: ButtonProps['size'] }) {
  const on = usePrefs((s) => s.compare.includes(id))
  const add = usePrefs((s) => s.addCompare)
  const remove = usePrefs((s) => s.removeCompare)
  const [full, setFull] = useState(false)
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size={size}
        variant={on ? 'soft' : 'outline'}
        aria-pressed={on}
        aria-label={`${name} ${on ? '비교에서 빼기' : '비교에 담기'}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (on) {
            remove(id)
            setFull(false)
          } else setFull(!add(id))
        }}
      >
        <GitCompareArrows aria-hidden="true" />
        {on ? '비교 중' : '비교 담기'}
      </Button>
      {full && (
        <span role="alert" className="text-[12px] font-medium text-up">
          비교는 최대 {MAX_COMPARE}개까지 담을 수 있습니다.
        </span>
      )}
    </span>
  )
}
