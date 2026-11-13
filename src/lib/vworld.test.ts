import { describe, expect, it } from 'vitest'
import { buildUrl, parsePoint, queriesFor, VworldError } from './vworld'

describe('브이월드 지오코더', () => {
  it('지번이 있으면 지번 주소부터, 없으면 도로명 주소로 찾는다', () => {
    expect(queriesFor({ umdNm: '조례동', jibun: '766', roadAddress: null })).toEqual([
      ['순천시 조례동 766', 'parcel'],
      ['전라남도 순천시 조례동 766', 'parcel'],
    ])
    expect(queriesFor({ umdNm: '매곡동', jibun: null, roadAddress: '순천시 매곡길 11' })).toEqual([['순천시 매곡길 11', 'road']])
    expect(queriesFor({ umdNm: '매곡동', jibun: null, roadAddress: null })).toEqual([])
  })

  it('요청 주소에 필요한 값을 담는다', () => {
    const u = new URL(buildUrl('KEY', '순천시 조례동 766', 'parcel'))
    expect(u.searchParams.get('request')).toBe('getcoord')
    expect(u.searchParams.get('type')).toBe('parcel')
    expect(u.searchParams.get('crs')).toBe('epsg:4326')
    expect(u.searchParams.get('key')).toBe('KEY')
  })

  it('순천 주소의 좌표만 인정하고 키 오류는 멈춤 오류로 알린다', () => {
    const ok = (text: string, x: string, y: string) => ({ response: { status: 'OK', refined: { text }, result: { point: { x, y } } } })
    expect(parsePoint(ok('전남광주통합특별시 순천시 조례동 766', '127.5199', '34.9731'))).toEqual({
      lat: 34.9731,
      lng: 127.5199,
      refined: '전남광주통합특별시 순천시 조례동 766',
    })
    expect(parsePoint(ok('경기도 수원시 조례동 766', '127.0', '37.2'))).toBeNull()
    expect(parsePoint({ response: { status: 'NOT_FOUND' } })).toBeNull()
    try {
      parsePoint({ response: { status: 'ERROR', error: { code: 'INCORRECT_KEY', text: '키 오류' } } })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(VworldError)
      expect((e as VworldError).fatal).toBe(true)
    }
  })
})
