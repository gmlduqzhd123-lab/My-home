import { AlertTriangle, Clock, PlugZap, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import type { DataError, Resource } from '@/lib/data'
import { Skeleton } from './primitives'

function StateBox({
  icon,
  title,
  children,
  tone = 'neutral',
  className,
  role,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  tone?: 'neutral' | 'warn' | 'error'
  className?: string
  role?: 'status' | 'alert'
}) {
  return (
    <div
      role={role ?? 'status'}
      className={cn('flex flex-col items-center justify-center gap-2 px-4 py-10 text-center', className)}
    >
      <div
        className={cn(
          'flex size-11 items-center justify-center rounded-full [&_svg]:size-5',
          tone === 'error' ? 'bg-up-soft text-up' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted',
        )}
      >
        {icon}
      </div>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {children && <div className="max-w-md text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  )
}

export function EmptyState({ title = '검색 결과가 없습니다', children, className }: { title?: string; children?: ReactNode; className?: string }) {
  return (
    <StateBox icon={<SearchX />} title={title} className={className}>
      {children ?? '검색 조건을 바꾸거나 기간을 넓혀 보세요.'}
    </StateBox>
  )
}

export function ErrorState({ error, className }: { error: DataError; className?: string }) {
  return (
    <StateBox icon={<AlertTriangle />} title="데이터를 불러오지 못했습니다" tone="error" role="alert" className={className}>
      {error.message} 잠시 후 새로고침해 주세요.
    </StateBox>
  )
}

/** 공공데이터 수집이 아직 한 번도 이뤄지지 않은 상태 */
export function PendingState({ title = '데이터 연결 대기 중', children, className }: { title?: string; children?: ReactNode; className?: string }) {
  return (
    <StateBox icon={<PlugZap />} title={title} tone="warn" className={className}>
      {children ?? (
        <>
          아직 공공데이터 수집이 실행되지 않았습니다. 인증키를 등록하고 수집 작업을 실행하면 실제 자료가 표시됩니다.
          확인되지 않은 가격은 표시하지 않습니다.{' '}
          <Link to="/about" className="font-semibold text-accent-ink underline underline-offset-2">
            연결 방법 보기
          </Link>
        </>
      )}
    </StateBox>
  )
}

export function NotAvailable({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <StateBox icon={<Clock />} title={title} className={className}>
      {children}
    </StateBox>
  )
}

export function LoadingBlock({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className={cn('space-y-2.5 p-4 sm:p-5', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-5', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** Resource 상태에 따라 로딩·오류·연결대기·정상을 분기한다. */
export function ResourceView<T>({
  res,
  children,
  rows,
  pendingWhenMissing = true,
}: {
  res: Resource<T>
  children: (data: T) => ReactNode
  rows?: number
  /** 파일이 없으면(404) 오류 대신 "연결 대기"로 안내 */
  pendingWhenMissing?: boolean
}) {
  if (res.status === 'idle' || res.status === 'loading') return <LoadingBlock rows={rows} />
  if (res.status === 'error') {
    if (pendingWhenMissing && res.error.kind === 'not_found') return <PendingState />
    return <ErrorState error={res.error} />
  }
  return <>{children(res.data)}</>
}
