import type { AlertItem } from '@/types'

export type AlertState = 'open' | 'upcoming' | 'closed' | 'unknown'

export interface AlertPhase {
  state: AlertState
  /** upcoming: 접수 시작까지 남은 일수 / open: 마감까지 남은 일수 / 그 외 null */
  days: number | null
  label: string
}

const DAY = 86_400_000
const toUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY)

/** 한국시간 기준 오늘 날짜(YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/**
 * 공고의 진행 단계. 접수 시작일이 있으면 [시작, 종료] 기간으로, 마감일만 있으면(LH 공고) 마감일까지를 '공고 중'으로 본다.
 * 일정이 확인되지 않은 공고는 unknown — 임의로 단계를 만들지 않는다.
 */
export function alertPhase(item: AlertItem, today: string): AlertPhase {
  const start = item.receiptStart
  const end = item.receiptEnd ?? item.receiptStart
  if (!start && !end) return { state: 'unknown', days: null, label: '일정 확인 불가' }
  if (start && today < start) {
    const d = daysBetween(today, start)
    return { state: 'upcoming', days: d, label: `접수 D-${d}` }
  }
  if (end && today <= end) {
    const d = daysBetween(today, end)
    return { state: 'open', days: d, label: start ? (d === 0 ? '접수 중 · 오늘 마감' : `접수 중 · 마감 D-${d}`) : d === 0 ? '오늘 마감' : `마감 D-${d}` }
  }
  return { state: 'closed', days: null, label: start ? '접수 마감' : '공고 마감' }
}

/** 마지막 확인 이후 새로 확인된 공고. 한 번도 확인한 적이 없으면 최근 14일 안에 공고된 것을 새 공고로 본다. */
export function newAlerts(items: AlertItem[], seenAt: string | null, today: string): AlertItem[] {
  if (seenAt) {
    const seen = new Date(seenAt).getTime()
    return items.filter((i) => new Date(i.firstSeenAt).getTime() > seen)
  }
  return items.filter((i) => i.announceDate != null && daysBetween(i.announceDate, today) >= 0 && daysBetween(i.announceDate, today) <= 14)
}

const ORDER: Record<AlertState, number> = { open: 0, upcoming: 1, unknown: 2, closed: 3 }

/** 일정 목록 정렬: 접수 중(마감 임박순) → 접수 예정(시작 임박순) → 일정 미확인 → 마감(최근순) */
export function sortBySchedule(items: AlertItem[], today: string): { item: AlertItem; phase: AlertPhase }[] {
  return items
    .map((item) => ({ item, phase: alertPhase(item, today) }))
    .sort((a, b) => {
      if (a.phase.state !== b.phase.state) return ORDER[a.phase.state] - ORDER[b.phase.state]
      if (a.phase.state === 'closed') return (b.item.receiptEnd ?? '').localeCompare(a.item.receiptEnd ?? '')
      if (a.phase.days != null && b.phase.days != null) return a.phase.days - b.phase.days
      return (b.item.announceDate ?? '').localeCompare(a.item.announceDate ?? '')
    })
}

/** 캘린더 파일 주소. scheme 을 webcal 로 바꾸면 캘린더 앱이 '구독'으로 연다. */
export function calendarUrls(baseUrl: string, pageUrl: string): { https: string; webcal: string } {
  const u = new URL(`${baseUrl}data/presales.ics`, pageUrl)
  u.hash = ''
  u.search = ''
  return { https: u.toString(), webcal: u.toString().replace(/^https?:/, 'webcal:') }
}

/** GitHub Pages 주소(owner.github.io/repo)에서 저장소 주소를 추정한다. 그 밖의 주소면 null. */
export function repoUrlFromPage(pageUrl: string): string | null {
  const u = new URL(pageUrl)
  const m = u.hostname.match(/^([a-z0-9-]+)\.github\.io$/i)
  const repo = u.pathname.split('/').filter(Boolean)[0]
  return m && repo ? `https://github.com/${m[1]}/${repo}` : null
}
