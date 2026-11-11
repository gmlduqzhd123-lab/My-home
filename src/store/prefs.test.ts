import { beforeEach, describe, expect, it } from 'vitest'
import { exportSaved, MAX_COMPARE, parseSaved, PREFS_KEY, usePrefs } from './prefs'

beforeEach(() => {
  usePrefs.setState({ favorites: [], favoriteZones: [], compare: [], zoneId: 'all', theme: 'system' })
})

describe('관심 단지 저장', () => {
  it('추가·해제하고 localStorage 에 저장한다', () => {
    usePrefs.getState().toggleFavorite('c1')
    usePrefs.getState().toggleFavorite('c2')
    usePrefs.getState().toggleFavorite('c1')
    expect(usePrefs.getState().favorites).toEqual(['c2'])
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY)!)
    expect(saved.state.favorites).toEqual(['c2'])
  })

  it('저장된 값을 복원한다', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ state: { favorites: ['x', 'y'], favoriteZones: ['wangji'], compare: ['x'], zoneId: 'jorye', theme: 'dark' }, version: 1 }))
    await usePrefs.persist.rehydrate()
    const s = usePrefs.getState()
    expect(s.favorites).toEqual(['x', 'y'])
    expect(s.favoriteZones).toEqual(['wangji'])
    expect(s.zoneId).toBe('jorye')
  })

  it('관심 지역 토글', () => {
    usePrefs.getState().toggleFavoriteZone('sindae')
    expect(usePrefs.getState().favoriteZones).toEqual(['sindae'])
    usePrefs.getState().toggleFavoriteZone('sindae')
    expect(usePrefs.getState().favoriteZones).toEqual([])
  })
})

describe('비교 목록', () => {
  it(`최대 ${MAX_COMPARE}개까지만 담는다`, () => {
    const { addCompare } = usePrefs.getState()
    expect(['a', 'b', 'c', 'd'].map(addCompare)).toEqual([true, true, true, true])
    expect(addCompare('e')).toBe(false)
    expect(addCompare('a')).toBe(true) // 이미 있는 단지는 성공으로 처리
    expect(usePrefs.getState().compare).toEqual(['a', 'b', 'c', 'd'])
    usePrefs.getState().removeCompare('b')
    expect(usePrefs.getState().compare).toEqual(['a', 'c', 'd'])
    expect(addCompare('e')).toBe(true)
  })
  it('setCompare 는 중복을 없애고 4개로 자른다', () => {
    usePrefs.getState().setCompare(['a', 'a', 'b', 'c', 'd', 'e'])
    expect(usePrefs.getState().compare).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('내보내기·가져오기', () => {
  it('내보낸 파일을 그대로 가져올 수 있다', () => {
    const text = exportSaved({ favorites: ['c1', 'c2'], favoriteZones: ['wangji'], compare: ['c1'] })
    expect(parseSaved(text)).toEqual({ favorites: ['c1', 'c2'], favoriteZones: ['wangji'], compare: ['c1'] })
  })
  it('잘못된 파일은 거부한다', () => {
    expect(() => parseSaved('{oops')).toThrow('JSON 형식이 아닙니다')
    expect(() => parseSaved('{"app":"other","favorites":[]}')).toThrow('순천집 ZIP')
    expect(() => parseSaved('{"app":"suncheon-zip","favorites":[1,2]}')).toThrow('관심 단지 목록')
  })
  it('알 수 없는 지역·초과 비교 항목은 걸러 낸다', () => {
    const d = parseSaved(JSON.stringify({ app: 'suncheon-zip', favorites: ['a', 'a'], favoriteZones: ['wangji', 'nowhere'], compare: ['1', '2', '3', '4', '5'] }))
    expect(d).toEqual({ favorites: ['a'], favoriteZones: ['wangji'], compare: ['1', '2', '3', '4'] })
  })
})
