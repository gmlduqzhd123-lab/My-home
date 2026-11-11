import zonesJson from './zones.json'

/**
 * 서비스용 "생활권" 정의 (zones.json — Python 브리핑 생성기와 공유).
 * 실거래 자료는 법정동(읍·면은 리) 단위로만 제공되므로, 생활권은 법정동 이름 매칭으로 구성한다.
 * 택지지구처럼 법정동 경계와 일치하지 않는 생활권은 approx=true 로 표시하고 화면에 그 사실을 안내한다.
 */
export interface Zone {
  id: string
  name: string
  kind: string // '법정동' | '택지지구'
  /** 거래 자료의 법정동명(umdNm)에 이 문자열 중 하나가 포함되면 해당 생활권 */
  match: string[]
  approx?: boolean
  note?: string
}

export const ZONES: Zone[] = zonesJson

export const ALL_ZONE = 'all'

export function findZone(id: string | null | undefined): Zone | null {
  return ZONES.find((z) => z.id === id) ?? null
}

export function inZone(umdNm: string, zoneId: string): boolean {
  if (zoneId === ALL_ZONE) return true
  const z = findZone(zoneId)
  if (!z) return true
  return z.match.some((m) => umdNm.includes(m))
}

/** 순천시청 부근(지도 초기 중심). 단지 좌표로 쓰지 않는다. */
export const SUNCHEON_CENTER = { lat: 34.9506, lng: 127.4872 }
