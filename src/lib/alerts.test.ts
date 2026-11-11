import { describe, expect, it } from 'vitest'
import type { AlertItem } from '@/types'
import { alertPhase, calendarUrls, newAlerts, repoUrlFromPage, sortBySchedule, todayKst } from './alerts'

function item(o: Partial<AlertItem>): AlertItem {
  return {
    id: 'a', kind: '청약홈 분양', title: '테스트 분양', location: null, announceDate: '2026-11-01', receiptStart: null, receiptEnd: null,
    winnerDate: null, contractStart: null, contractEnd: null, households: null, url: null, firstSeenAt: '2026-11-01T08:00:00+09:00', ...o,
  }
}

const TODAY = '2026-11-11'

describe('청약 진행 단계', () => {
  it('접수 예정: 시작일까지 남은 날', () => {
    expect(alertPhase(item({ receiptStart: '2026-11-17', receiptEnd: '2026-11-19' }), TODAY)).toEqual({ state: 'upcoming', days: 6, label: '접수 D-6' })
    expect(alertPhase(item({ receiptStart: '2026-12-01' }), TODAY).days).toBe(20) // 달이 바뀌어도 정확히
  })
  it('접수 중: 마감까지 남은 날', () => {
    expect(alertPhase(item({ receiptStart: '2026-11-10', receiptEnd: '2026-11-12' }), TODAY)).toEqual({ state: 'open', days: 1, label: '접수 중 · 마감 D-1' })
    expect(alertPhase(item({ receiptStart: '2026-11-09', receiptEnd: '2026-11-11' }), TODAY).label).toBe('접수 중 · 오늘 마감')
    expect(alertPhase(item({ receiptStart: '2026-11-11' }), TODAY).state).toBe('open') // 하루짜리 접수
  })
  it('마감', () => {
    expect(alertPhase(item({ receiptStart: '2026-11-01', receiptEnd: '2026-11-10' }), TODAY)).toEqual({ state: 'closed', days: null, label: '접수 마감' })
  })
  it('마감일만 있는 공고(LH)는 마감일까지 공고 중', () => {
    expect(alertPhase(item({ receiptEnd: '2026-11-20' }), TODAY)).toEqual({ state: 'open', days: 9, label: '마감 D-9' })
    expect(alertPhase(item({ receiptEnd: '2026-11-05' }), TODAY).label).toBe('공고 마감')
  })
  it('일정이 없으면 단계를 만들지 않는다', () => {
    expect(alertPhase(item({}), TODAY)).toEqual({ state: 'unknown', days: null, label: '일정 확인 불가' })
  })
  it('오늘 날짜는 한국시간 기준', () => {
    expect(todayKst(new Date('2026-11-10T15:30:00Z'))).toBe('2026-11-11') // UTC 로는 10일, 한국은 11일 00:30
    expect(todayKst(new Date('2026-11-10T14:59:00Z'))).toBe('2026-11-10')
  })
})

describe('새 공고 판별', () => {
  const items = [
    item({ id: 'old', firstSeenAt: '2026-11-05T08:00:00+09:00', announceDate: '2026-10-01' }),
    item({ id: 'new', firstSeenAt: '2026-11-11T08:00:00+09:00', announceDate: '2026-11-10' }),
  ]
  it('마지막 확인 이후 수집된 공고만', () => {
    expect(newAlerts(items, '2026-11-10T08:00:00+09:00', TODAY).map((i) => i.id)).toEqual(['new'])
    expect(newAlerts(items, '2026-11-11T08:00:00+09:00', TODAY)).toEqual([]) // 확인 처리 후에는 없음
    expect(newAlerts(items, '2026-11-10T23:00:00Z', TODAY)).toEqual([]) // 시간대 표기가 달라도 같은 시각으로 비교
  })
  it('처음 방문하면 최근 14일 안에 공고된 것', () => {
    expect(newAlerts(items, null, TODAY).map((i) => i.id)).toEqual(['new'])
    expect(newAlerts([item({ announceDate: null })], null, TODAY)).toEqual([])
  })
})

describe('일정 정렬과 주소', () => {
  it('접수 중(마감 임박순) → 접수 예정(시작 임박순) → 일정 미확인 → 마감(최근순)', () => {
    const list = [
      item({ id: 'closed-old', receiptStart: '2026-09-01', receiptEnd: '2026-09-03' }),
      item({ id: 'up-far', receiptStart: '2026-12-10' }),
      item({ id: 'open-late', receiptStart: '2026-11-10', receiptEnd: '2026-11-18' }),
      item({ id: 'unknown' }),
      item({ id: 'up-near', receiptStart: '2026-11-14' }),
      item({ id: 'open-soon', receiptEnd: '2026-11-12' }),
      item({ id: 'closed-new', receiptStart: '2026-11-01', receiptEnd: '2026-11-05' }),
    ]
    expect(sortBySchedule(list, TODAY).map((x) => x.item.id)).toEqual(['open-soon', 'open-late', 'up-near', 'up-far', 'unknown', 'closed-new', 'closed-old'])
  })
  it('캘린더 구독 주소', () => {
    expect(calendarUrls('/My-home/', 'https://user.github.io/My-home/#/alerts?x=1')).toEqual({
      https: 'https://user.github.io/My-home/data/presales.ics',
      webcal: 'webcal://user.github.io/My-home/data/presales.ics',
    })
    expect(calendarUrls('./', 'http://localhost:5173/#/alerts').webcal).toBe('webcal://localhost:5173/data/presales.ics')
  })
  it('GitHub Pages 주소에서만 저장소 주소를 만든다', () => {
    expect(repoUrlFromPage('https://user-name.github.io/My-home/#/alerts')).toBe('https://github.com/user-name/My-home')
    expect(repoUrlFromPage('http://localhost:5173/#/alerts')).toBeNull()
    expect(repoUrlFromPage('https://example.com/app/')).toBeNull()
  })
})
