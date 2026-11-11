import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, isChunkLoadError, reloadOnce } from './ErrorBoundary'

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('화면 오류 처리', () => {
  const reload = vi.fn()
  beforeEach(() => {
    reload.mockClear()
    sessionStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
  })
  afterEach(() => vi.restoreAllMocks())

  it('이전 버전 코드 조각을 못 찾는 오류를 구분한다', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/TradesPage-abc.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error("Cannot read properties of null (reading 'x')"))).toBe(false)
  })

  it('새로고침은 30초 안에 한 번만 한다', () => {
    expect(reloadOnce(100_000)).toBe(true)
    expect(reloadOnce(110_000)).toBe(false)
    expect(reloadOnce(140_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('새 버전 배포로 생긴 오류는 자동으로 새로고침한다', () => {
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/MapPage-1.js" />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('새 버전을 불러오는 중입니다')
  })

  it('방금 새로고침했는데도 실패하면 빈 화면 대신 안내와 버튼을 보여 준다', () => {
    sessionStorage.setItem('suncheon-zip:reloaded-at', String(Date.now()))
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/MapPage-1.js" />
      </ErrorBoundary>,
    )
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('새 버전이 배포되었습니다')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
  })

  it('그 밖의 오류도 빈 화면 대신 안내를 보여 준다', () => {
    render(
      <ErrorBoundary>
        <Boom message="알 수 없는 오류" />
      </ErrorBoundary>,
    )
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('화면을 표시하지 못했습니다')
  })
})
