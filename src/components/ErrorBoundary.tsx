import { RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/button'

const RELOAD_KEY = 'suncheon-zip:reloaded-at'

/** 새 버전 배포 뒤 이전 버전의 코드 조각을 찾지 못해 생기는 오류인지 */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i.test(msg)
}

/**
 * 새 버전을 받기 위해 한 번만 새로고침한다(30초 안에 다시 실패하면 반복하지 않는다).
 * 새로고침을 시작했으면 true.
 */
export function reloadOnce(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (now - last < 30_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false // 저장소를 쓸 수 없으면 무한 새로고침 위험이 있으므로 하지 않는다
  }
  window.location.reload()
  return true
}

interface State {
  error: Error | null
  reloading: boolean
}

/** 화면 렌더링 중 오류가 나도 빈 화면 대신 안내와 새로고침 버튼을 보여 준다. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null, reloading: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isChunkLoadError(error) && reloadOnce()) {
      this.setState({ reloading: true })
      return
    }
    console.error('화면 오류', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    // 다른 화면으로 이동하면 오류 상태를 풀어 준다
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, reloading: false })
  }

  render(): ReactNode {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    const chunk = isChunkLoadError(error)
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="text-[15px] font-bold text-ink">
          {reloading ? '새 버전을 불러오는 중입니다…' : chunk ? '새 버전이 배포되었습니다' : '화면을 표시하지 못했습니다'}
        </p>
        {!reloading && (
          <>
            <p className="text-[13px] leading-relaxed text-muted">
              {chunk
                ? '열려 있던 화면이 이전 버전이라 일부 파일을 찾지 못했습니다. 새로고침하면 최신 버전으로 열립니다.'
                : '일시적인 오류일 수 있습니다. 새로고침해도 계속되면 잠시 후 다시 시도해 주세요.'}
            </p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RefreshCw /> 새로고침
            </Button>
          </>
        )}
      </div>
    )
  }
}
