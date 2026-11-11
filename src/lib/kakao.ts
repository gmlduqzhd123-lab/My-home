/**
 * Kakao Maps JavaScript SDK 로더.
 * 브라우저용 JavaScript 키(VITE_KAKAO_MAP_APP_KEY)만 사용한다 — 공개되는 키이므로 Kakao Developers 에서
 * 반드시 서비스 도메인(JavaScript SDK 도메인)을 등록해 제한해야 한다. REST 키·공공데이터 키는 여기서 쓰지 않는다.
 */

export interface KLatLng {
  getLat(): number
  getLng(): number
}
export interface KMap {
  setCenter(p: KLatLng): void
  panTo(p: KLatLng): void
  setLevel(level: number): void
  getLevel(): number
  setBounds(b: KBounds): void
  relayout(): void
}
export interface KBounds {
  extend(p: KLatLng): void
}
export interface KMarker {
  setMap(m: KMap | null): void
  getPosition(): KLatLng
}
export interface KOverlay {
  setMap(m: KMap | null): void
}
export interface KClusterer {
  addMarkers(m: KMarker[]): void
  clear(): void
}
export interface KPlace {
  id: string
  place_name: string
  category_name: string
  distance: string
  road_address_name: string
  address_name: string
  place_url: string
}
export interface KPlaces {
  categorySearch(code: string, cb: (data: KPlace[], status: string) => void, opts: Record<string, unknown>): void
  keywordSearch(q: string, cb: (data: KPlace[], status: string) => void, opts: Record<string, unknown>): void
}
export interface KakaoNS {
  maps: {
    load(cb: () => void): void
    LatLng: new (lat: number, lng: number) => KLatLng
    LatLngBounds: new () => KBounds
    Map: new (el: HTMLElement, opts: { center: KLatLng; level: number }) => KMap
    Marker: new (opts: { position: KLatLng; title?: string; clickable?: boolean }) => KMarker
    CustomOverlay: new (opts: { position: KLatLng; content: HTMLElement | string; yAnchor?: number; zIndex?: number }) => KOverlay
    MarkerClusterer: new (opts: { map: KMap; averageCenter?: boolean; minLevel?: number; gridSize?: number }) => KClusterer
    event: { addListener(target: unknown, type: string, handler: () => void): void }
    services: {
      Places: new () => KPlaces
      Status: { OK: string; ZERO_RESULT: string; ERROR: string }
      SortBy: { DISTANCE: string }
    }
  }
}

declare global {
  interface Window {
    kakao?: KakaoNS
  }
}

export const KAKAO_KEY: string = (import.meta.env.VITE_KAKAO_MAP_APP_KEY ?? '').trim()
export const hasKakaoKey = KAKAO_KEY !== ''

export type KakaoLoadError = 'no_key' | 'load_failed'

let promise: Promise<KakaoNS> | null = null

export function loadKakao(): Promise<KakaoNS> {
  if (!hasKakaoKey) return Promise.reject<KakaoNS>('no_key' satisfies KakaoLoadError)
  if (!promise) {
    promise = new Promise<KakaoNS>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY)}&libraries=services,clusterer&autoload=false`
      s.async = true
      const fail = () => {
        promise = null
        s.remove()
        reject('load_failed' satisfies KakaoLoadError)
      }
      s.onerror = fail
      s.onload = () => {
        // 도메인 미등록 등으로 SDK 가 초기화되지 않으면 load 콜백이 오지 않는다 → 시간 제한
        const timer = setTimeout(fail, 8000)
        try {
          window.kakao!.maps.load(() => {
            clearTimeout(timer)
            resolve(window.kakao!)
          })
        } catch {
          clearTimeout(timer)
          fail()
        }
      }
      document.head.appendChild(s)
    })
  }
  return promise
}
