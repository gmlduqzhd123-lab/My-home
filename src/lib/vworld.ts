/**
 * 브이월드 지오코더 2.0 — 운영자 관리 화면에서만 쓴다.
 * 브이월드는 해외 서버(GitHub Actions)에서 접속이 막혀, 국내에 있는 운영자 브라우저에서 JSONP 로 호출한다.
 * 키는 화면에서 입력받아 메모리에서만 쓰며 코드·저장소·브라우저 저장소에 남기지 않는다.
 */

export const VWORLD_URL = 'https://api.vworld.kr/req/address'

/** 순천시 일대(경도 최소, 위도 최대, 경도 최대, 위도 최소) — 수집기 config.SUNCHEON_VIEWBOX 와 같다 */
const BOX = { lngMin: 127.15, latMax: 35.15, lngMax: 127.7, latMin: 34.75 }

export interface VworldResponse {
  response?: {
    status?: string
    refined?: { text?: string }
    result?: { point?: { x?: string; y?: string } }
    error?: { code?: string; text?: string }
  }
}

export class VworldError extends Error {
  constructor(
    message: string,
    /** 키·도메인 문제처럼 계속해도 소용없는 오류 */
    readonly fatal: boolean,
  ) {
    super(message)
  }
}

let seq = 0

/** JSONP 호출(브이월드는 CORS 를 허용하지 않는다) */
export function jsonp<T>(url: string, timeoutMs = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const name = `__vworld_cb_${Date.now()}_${seq++}`
    const w = window as unknown as Record<string, unknown>
    const s = document.createElement('script')
    const done = () => {
      clearTimeout(timer)
      delete w[name]
      s.remove()
    }
    const timer = setTimeout(() => {
      done()
      reject(new VworldError('브이월드 응답이 없습니다(시간 초과).', false))
    }, timeoutMs)
    w[name] = (data: T) => {
      done()
      resolve(data)
    }
    s.src = `${url}&callback=${name}`
    s.onerror = () => {
      done()
      reject(new VworldError('브이월드에 접속하지 못했습니다. 네트워크 상태를 확인해 주세요.', false))
    }
    document.head.appendChild(s)
  })
}

export function buildUrl(key: string, address: string, type: 'parcel' | 'road'): string {
  const p = new URLSearchParams({
    service: 'address',
    request: 'getcoord',
    version: '2.0',
    crs: 'epsg:4326',
    address,
    refine: 'true',
    simple: 'false',
    format: 'json',
    type,
    key,
  })
  return `${VWORLD_URL}?${p.toString()}`
}

/** 응답 해석: 좌표 또는 null(결과 없음·순천 밖). 키 오류 등은 VworldError */
export function parsePoint(data: VworldResponse): { lat: number; lng: number; refined: string } | null {
  const r = data.response ?? {}
  const status = (r.status ?? '').toUpperCase()
  if (status === 'NOT_FOUND') return null
  if (status !== 'OK') {
    const code = r.error?.code ?? status ?? ''
    const fatal = /KEY|DOMAIN|AUTH|UNAVAILABLE|LIMIT/i.test(code)
    throw new VworldError(`브이월드 오류: ${code || '응답 없음'} ${r.error?.text ?? ''}`.trim(), fatal)
  }
  const refined = r.refined?.text ?? ''
  const lat = Number(r.result?.point?.y)
  const lng = Number(r.result?.point?.x)
  if (!refined.includes('순천') || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < BOX.latMin || lat > BOX.latMax || lng < BOX.lngMin || lng > BOX.lngMax) return null
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, refined }
}

/** 단지 하나의 검색 후보(주소, 종류). 지번이 있으면 지번 주소, 없으면 도로명 주소 */
export function queriesFor(c: { umdNm: string; jibun: string | null; roadAddress: string | null }): [string, 'parcel' | 'road'][] {
  const out: [string, 'parcel' | 'road'][] = []
  if (c.jibun) {
    out.push([`순천시 ${c.umdNm} ${c.jibun}`, 'parcel'])
    out.push([`전라남도 순천시 ${c.umdNm} ${c.jibun}`, 'parcel'])
  }
  if (c.roadAddress) out.push([c.roadAddress, 'road'])
  return out
}
