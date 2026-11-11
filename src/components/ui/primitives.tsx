import type { HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-surface', className)} {...props} />
}

export function CardHeader({
  title,
  desc,
  action,
  className,
}: {
  title: ReactNode
  desc?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {desc && <p className="mt-0.5 text-[13px] text-muted">{desc}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />
}

type BadgeTone = 'neutral' | 'accent' | 'up' | 'down' | 'warn'

const badgeTone: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  up: 'bg-up-soft text-up',
  down: 'bg-down-soft text-down',
  warn: 'bg-warn-soft text-warn',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold whitespace-nowrap',
        badgeTone[tone],
        className,
      )}
      {...props}
    />
  )
}

const fieldBase =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 disabled:opacity-50'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, 'pr-8', className)} {...props} />
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[12px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}

export function PageTitle({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

/** 여러 선택지 중 하나를 고르는 버튼 그룹 */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 cursor-pointer rounded-lg px-3 text-[13px] font-semibold transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
