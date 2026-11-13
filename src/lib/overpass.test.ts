import { describe, expect, it } from 'vitest'
import { buildQuery, distanceM, groupPlaces } from './overpass'

const LAT = 34.95
const LNG = 127.5

describe('주변 시설(Overpass)', () => {
  it('종류별 반경으로 질의를 만든다', () => {
    const q = buildQuery(LAT, LNG)
    expect(q).toContain('nwr(around:1500,34.950000,127.500000)["amenity"="school"];')
    expect(q).toContain('node(around:500,34.950000,127.500000)["highway"="bus_stop"];')
    expect(q).toContain('out center tags;')
  })

  it('직선거리를 미터로 계산한다', () => {
    // 위도 0.01도 ≈ 1,112m
    expect(distanceM(LAT, LNG, LAT + 0.01, LNG)).toBeGreaterThan(1100)
    expect(distanceM(LAT, LNG, LAT + 0.01, LNG)).toBeLessThan(1120)
  })

  it('종류별로 묶고 가까운 순으로 정렬하며 이름 없는 곳·반경 밖·중복은 뺀다', () => {
    const r = groupPlaces(
      [
        { type: 'node', id: 1, lat: LAT + 0.003, lon: LNG, tags: { amenity: 'pharmacy', name: '먼약국' } },
        { type: 'node', id: 2, lat: LAT + 0.001, lon: LNG, tags: { amenity: 'pharmacy', name: 'Near', 'name:ko': '가까운약국' } },
        { type: 'node', id: 3, lat: LAT + 0.001, lon: LNG, tags: { amenity: 'pharmacy' } },
        { type: 'way', id: 4, center: { lat: LAT + 0.002, lon: LNG }, tags: { amenity: 'school', name: '순천초등학교' } },
        { type: 'relation', id: 5, center: { lat: LAT + 0.004, lon: LNG }, tags: { amenity: 'school', name: '순천초등학교' } },
        { type: 'node', id: 6, lat: LAT + 0.02, lon: LNG, tags: { shop: 'convenience', name: '반경밖편의점' } },
      ],
      LAT,
      LNG,
    )
    expect(r.pharmacy.map((p) => p.name)).toEqual(['가까운약국', '먼약국'])
    expect(r.school).toHaveLength(1)
    expect(r.school[0].url).toBe('https://www.openstreetmap.org/way/4')
    expect(r.store).toEqual([])
    expect(r.bus).toEqual([])
  })
})
