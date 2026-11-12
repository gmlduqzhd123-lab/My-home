import { AlertTriangle, Bell, Clock, FlaskConical, Heart, Menu, Monitor, Moon, PlugZap, Sun, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ALL_ZONE, ZONES } from '@/config/zones'
import { useAlertNotifier, useAlerts } from '@/hooks/useAlerts'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/cn'
import { freshness, useManifest } from '@/lib/data'
import { formatDateTime } from '@/lib/format'
import { usePrefs, type Theme } from '@/store/prefs'
import type { Manifest } from '@/types'
import { HeaderSearch } from './HeaderSearch'
import { BOTTOM_NAV, SIDE_NAV, type NavItem } from './nav'

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" title="홈으로">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#00A88F" />
        <path d="M32 13 12 30h6v20h10V38h8v12h10V30h6z" fill="#14233B" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight text-ink">순천집 ZIP</span>
        <span className="hidden text-[11px] text-muted xl:block">순천 부동산의 모든 것</span>
      </span>
    </Link>
  )
}

function ZoneSelect({ className }: { className?: string }) {
  const zoneId = usePrefs((s) => s.zoneId)
  const setZone = usePrefs((s) => s.setZone)
  return (
    <select
      aria-label="생활권 선택"
      value={zoneId}
      onChange={(e) => setZone(e.target.value)}
      className={cn(
        'h-9 cursor-pointer rounded-xl border border-transparent bg-surface-2 px-2 text-[13px] font-semibold text-ink',
        className,
      )}
    >
      <option value={ALL_ZONE}>순천시 전체</option>
      {ZONES.map((z) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </select>
  )
}

const THEME_ORDER: Theme[] = ['system', 'light', 'dark']
const THEME_META: Record<Theme, { label: string; icon: typeof Sun }> = {
  system: { label: '시스템 설정', icon: Monitor },
  light: { label: '밝은 화면', icon: Sun },
  dark: { label: '어두운 화면', icon: Moon },
}

function ThemeToggle() {
  const theme = usePrefs((s) => s.theme)
  const setTheme = usePrefs((s) => s.setTheme)
  const Icon = THEME_META[theme].icon
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`화면 테마: ${THEME_META[theme].label}`}
      aria-label={`화면 테마: ${THEME_META[theme].label}. 누르면 ${THEME_META[next].label}(으)로 변경`}
      className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
    >
      <Icon className="size-[18px]" />
    </button>
  )
}

function DataStamp({ manifest }: { manifest: Manifest | null }) {
  if (!manifest) return null
  const f = freshness(manifest)
  return (
    <Link
      to="/about"
      className="hidden shrink-0 text-right text-[11px] leading-tight text-muted hover:text-ink lg:block"
      title="데이터 출처와 갱신 정보 보기"
    >
      <span className="block">데이터 기준</span>
      <span className="num block font-semibold text-ink">
        {f === 'pending' ? '연결 대기' : formatDateTime(manifest.generatedAt)}
      </span>
    </Link>
  )
}

/** 데이터 상태 안내 띠: 연결 대기 / 조회 실패(이전 자료 표시) / 갱신 지연 / 가상 데이터 */
function StatusBanner({ manifest }: { manifest: Manifest }) {
  const f = freshness(manifest)
  const rows: { key: string; tone: string; icon: ReactNode; text: ReactNode }[] = []
  if (manifest.fixture) {
    rows.push({
      key: 'fixture',
      tone: 'bg-up-soft text-up',
      icon: <FlaskConical />,
      text: '화면 점검용 가상 테스트 데이터입니다. 실제 거래가 아닙니다.',
    })
  }
  if (f === 'pending') {
    rows.push({
      key: 'pending',
      tone: 'bg-warn-soft text-warn',
      icon: <PlugZap />,
      text: (
        <>
          공공데이터 연결 대기 중입니다. 실거래 자료가 아직 수집되지 않아 가격 정보를 표시하지 않습니다.{' '}
          <Link to="/about" className="font-bold underline underline-offset-2">
            연결 방법
          </Link>
        </>
      ),
    })
  } else if (f === 'failed') {
    rows.push({
      key: 'failed',
      tone: 'bg-up-soft text-up',
      icon: <AlertTriangle />,
      text: `최근 조회(${formatDateTime(manifest.lastAttemptAt)})에 실패해 ${formatDateTime(manifest.generatedAt)} 기준의 마지막 정상 자료를 표시하고 있습니다.`,
    })
  } else if (f === 'stale') {
    rows.push({
      key: 'stale',
      tone: 'bg-warn-soft text-warn',
      icon: <Clock />,
      text: `데이터 갱신이 지연되고 있습니다. 마지막 정상 갱신: ${formatDateTime(manifest.generatedAt)}`,
    })
  } else if (manifest.lastAttemptStatus === 'partial' && manifest.lastAttemptMessage) {
    rows.push({ key: 'partial', tone: 'bg-warn-soft text-warn', icon: <AlertTriangle />, text: manifest.lastAttemptMessage })
  }
  if (rows.length === 0) return null
  return (
    <div role="status">
      {rows.map((r) => (
        <div key={r.key} className={cn('flex items-start gap-2 px-4 py-2 text-[13px] font-medium [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0', r.tone)}>
          {r.icon}
          <p>{r.text}</p>
        </div>
      ))}
    </div>
  )
}

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition-colors',
          isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      {item.beta && <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] font-bold text-muted">연계 준비</span>}
    </NavLink>
  )
}

/** 상단 종: 마지막 확인 이후 새 청약 공고 수 */
function AlertBell() {
  const { fresh } = useAlerts()
  const n = fresh.length
  return (
    <Link
      to="/alerts"
      title="청약 알림"
      className="relative flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
    >
      <Bell className="size-[18px]" aria-hidden="true" />
      {/* 보이는 숫자 배지는 장식으로 두고, 읽어 주는 이름은 문장으로 제공한다 */}
      <span className="sr-only">{n > 0 ? `청약 알림, 새 공고 ${n}건` : '청약 알림'}</span>
      {n > 0 && (
        <span
          aria-hidden="true"
          className="num absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-up px-1 text-[10px] font-extrabold text-white"
        >
          {n > 9 ? '9+' : n}
        </span>
      )}
    </Link>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  useTheme()
  useAlertNotifier()
  const res = useManifest()
  const manifest = res.status === 'ok' ? res.data : null
  const favCount = usePrefs((s) => s.favorites.length)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const isMap = pathname === '/map'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="전체 메뉴 열기"
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-surface-2 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <Logo />
          <HeaderSearch className="ml-1 min-w-0 flex-1 lg:max-w-md" />
          <ZoneSelect className="hidden md:block" />
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Link
              to="/favorites"
              className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink hover:bg-surface-2 md:flex"
            >
              <Heart className="size-4" aria-hidden="true" />
              관심 단지
              <span className="num rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{favCount}</span>
            </Link>
            {/* 엽쌤의 다른 앱과 같은 상단 버튼: public/ys-install.js, public/ys-qr.js 가 연결 */}
            <button type="button" data-ys-install="" className="flex h-9 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg px-1 text-[13px] font-semibold text-ink hover:bg-surface-2 sm:px-2">
              📲<span className="ml-0.5 hidden sm:inline">앱&nbsp;</span>설치
            </button>
            <button type="button" data-qr="" aria-label="QR 코드로 접속" className="flex h-9 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg px-1 text-[13px] font-semibold text-ink hover:bg-surface-2 sm:px-2">
              📱 QR
            </button>
            <AlertBell />
            {/* 좁은 휴대폰에서는 설치·QR 자리를 위해 테마 버튼을 ☰ 메뉴 안으로 옮긴다 */}
            <span className="hidden sm:contents">
              <ThemeToggle />
            </span>
            <DataStamp manifest={manifest} />
          </div>
        </div>
      </header>

      {manifest && <StatusBanner manifest={manifest} />}

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 overflow-y-auto bg-surface p-3 lg:block">
          <nav aria-label="주 메뉴" className="space-y-1">
            {SIDE_NAV.map((item) => (
              <SideLink key={item.to} item={item} />
            ))}
          </nav>
          <p className="mt-6 px-3 text-[11px] leading-relaxed text-muted">
            순천의 모든 집, 모든 가격, 모든 변화를 한눈에.
          </p>
        </aside>

        <main
          id="main"
          className={cn('min-w-0 flex-1', isMap ? '' : 'mx-auto w-full max-w-6xl px-3 py-4 pb-24 sm:px-5 sm:py-6 lg:pb-10')}
        >
          {children}
          {!isMap && (
            <p className="mt-10 text-center text-[12px] text-muted">
              © 2026 엽쌤. All rights reserved. ·{' '}
              <a href="https://gmlduqzhd123-lab.github.io/YScode/" className="underline underline-offset-2 hover:text-ink">
                엽쌤의 다른 앱 보기 →
              </a>
            </p>
          )}
        </main>
      </div>

      <nav
        aria-label="하단 메뉴"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface lg:hidden"
      >
        {BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                isActive ? 'text-accent-ink' : 'text-muted',
              )
            }
          >
            <item.icon className="size-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="전체 메뉴">
          <button type="button" aria-label="메뉴 닫기" className="absolute inset-0 bg-black/45" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[15px] font-extrabold text-ink">순천집 ZIP</span>
              <span className="ml-auto sm:hidden">
                <ThemeToggle />
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="메뉴 닫기"
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mb-3">
              <ZoneSelect className="w-full" />
            </div>
            <nav aria-label="전체 메뉴" className="flex-1 space-y-1 overflow-y-auto">
              {SIDE_NAV.map((item) => (
                <SideLink key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
              ))}
            </nav>
            {manifest && (
              <p className="num px-3 pt-3 text-[11px] text-muted">
                데이터 기준: {manifest.generatedAt ? formatDateTime(manifest.generatedAt) : '연결 대기'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
