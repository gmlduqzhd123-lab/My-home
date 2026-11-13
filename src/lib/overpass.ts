/**
 * 단지 주변 시설 조회 — OpenStreetMap 데이터(Overpass API). 키·가입 불필요.
 * OSM 은 누구나 편집하는 지도라 빠진 시설이 있을 수 있다. 화면에 출처(© OpenStreetMap 기여자)를 표시한다.
 */

export interface PlaceGroup {
  key: string
  label: string
  radius: number
  /** Overpass 필터(대괄호 안 조건들) */
  filter: string
  /** 노드만 조회(버스정류장 등 점 시설) */
  nodeOnly?: boolean
  match: (tags: Record<string, string>) => boolean
}

export const PLACE_GROUPS: readonly PlaceGroup[] = [
  { key: 'school', label: '학교', radius: 1500, filter: '["amenity"="school"]', match: (t) => t.amenity === 'school' },
  {
    key: 'hospital',
    label: '병원',
    radius: 1000,
    filter: '["amenity"~"^(hospital|clinic|doctors)$"]',
    match: (t) => ['hospital', 'clinic', 'doctors'].includes(t.amenity),
  },
  { key: 'pharmacy', label: '약국', radius: 1000, filter: '["amenity"="pharmacy"]', match: (t) => t.amenity === 'pharmacy' },
  {
    key: 'mart',
    label: '대형마트·슈퍼',
    radius: 2000,
    filter: '["shop"~"^(supermarket|department_store|mall)$"]',
    match: (t) => ['supermarket', 'department_store', 'mall'].includes(t.shop),
  },
  { key: 'store', label: '편의점', radius: 500, filter: '["shop"="convenience"]', match: (t) => t.shop === 'convenience' },
  { key: 'park', label: '공원', radius: 1000, filter: '["leisure"="park"]', match: (t) => t.leisure === 'park' },
  { key: 'bus', label: '버스정류장', radius: 500, filter: '["highway"="bus_stop"]', nodeOnly: true, match: (t) => t.highway === 'bus_stop' },
]

export interface Place {
  id: string
  name: string
  distance: number
  url: string
}

export type PlaceResult = Record<string, Place[]>

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export function buildQuery(lat: number, lng: number): string {
  const at = (r: number) => `(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})`
  const parts = PLACE_GROUPS.map((g) => `${g.nodeOnly ? 'node' : 'nwr'}${at(g.radius)}${g.filter};`)
  return `[out:json][timeout:20];(${parts.join('')});out center tags;`
}

/** 두 좌표 사이 직선거리(m) */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

/** Overpass 응답을 시설 종류별로 묶어 가까운 순 최대 limit 곳씩 돌려준다. 이름이 없는 시설은 뺀다. */
export function groupPlaces(elements: OsmElement[], lat: number, lng: number, limit = 5): PlaceResult {
  const out: PlaceResult = Object.fromEntries(PLACE_GROUPS.map((g) => [g.key, [] as Place[]]))
  const seen = new Set<string>()
  for (const e of elements) {
    const tags = e.tags ?? {}
    const name = (tags['name:ko'] || tags.name || '').trim()
    const pLat = e.lat ?? e.center?.lat
    const pLng = e.lon ?? e.center?.lon
    if (!name || pLat == null || pLng == null) continue
    const g = PLACE_GROUPS.find((x) => x.match(tags))
    if (!g) continue
    const d = distanceM(lat, lng, pLat, pLng)
    if (d > g.radius) continue
    // 같은 이름이 건물·부지 등으로 여러 번 그려진 경우 하나만 남긴다
    const dedupe = `${g.key}:${name}`
    if (seen.has(dedupe)) {
      const prev = out[g.key].find((p) => p.name === name)
      if (prev && d < prev.distance) prev.distance = d
      continue
    }
    seen.add(dedupe)
    out[g.key].push({ id: `${e.type}/${e.id}`, name, distance: d, url: `https://www.openstreetmap.org/${e.type}/${e.id}` })
  }
  for (const k of Object.keys(out)) out[k] = out[k].sort((a, b) => a.distance - b.distance).slice(0, limit)
  return out
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const cache = new Map<string, Promise<PlaceResult>>()

async function post(endpoint: string, query: string): Promise<OsmElement[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { elements?: OsmElement[] }
    return json.elements ?? []
  } finally {
    clearTimeout(timer)
  }
}

/** 주변 시설 조회. 같은 좌표는 한 번만 요청하고, 첫 서버가 실패하면 예비 서버로 다시 시도한다. */
export function fetchNearby(lat: number, lng: number): Promise<PlaceResult> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  let p = cache.get(key)
  if (!p) {
    const query = buildQuery(lat, lng)
    p = (async () => {
      let last: unknown
      for (const ep of ENDPOINTS) {
        try {
          return groupPlaces(await post(ep, query), lat, lng)
        } catch (e) {
          last = e
        }
      }
      throw last
    })()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
