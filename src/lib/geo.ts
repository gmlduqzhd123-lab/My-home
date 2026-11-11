/** 두 좌표 사이의 직선거리(m, 하버사인) */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

export interface Located {
  lat: number | null
  lng: number | null
}

/** 기준 좌표에서 가까운 순서로 정렬해 거리와 함께 반환(좌표 없는 항목은 제외) */
export function nearest<T extends Located>(lat: number, lng: number, items: T[], limit: number): { item: T; meters: number }[] {
  return items
    .filter((x) => x.lat != null && x.lng != null)
    .map((item) => ({ item, meters: distanceM(lat, lng, item.lat!, item.lng!) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
}
