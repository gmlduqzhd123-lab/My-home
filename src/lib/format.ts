/** 만원 단위 금액 → "3억 2,500만" */
export function formatPrice(manwon: number | null | undefined): string {
  if (manwon == null || !Number.isFinite(manwon)) return '확인 불가'
  const v = Math.round(manwon)
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  const eok = Math.floor(abs / 10000)
  const rest = abs % 10000
  if (eok === 0) return `${sign}${rest.toLocaleString('ko-KR')}만`
  if (rest === 0) return `${sign}${eok.toLocaleString('ko-KR')}억`
  return `${sign}${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만`
}

/** 차트 축용 짧은 표기: 3.2억 / 8,500만 */
export function formatPriceShort(manwon: number): string {
  if (Math.abs(manwon) >= 10000) {
    const eok = manwon / 10000
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억`
  }
  return `${Math.round(manwon).toLocaleString('ko-KR')}만`
}

export function formatArea(area: number | null | undefined): string {
  if (area == null) return '확인 불가'
  return `${area.toFixed(2).replace(/\.?0+$/, '')}㎡`
}

/** 전용면적(㎡) → 평 환산(참고용) */
export function toPyeong(area: number): number {
  return Math.round((area / 3.305785) * 10) / 10
}

export function formatFloor(floor: number | null | undefined): string {
  if (floor == null) return '-'
  return floor < 0 ? `지하 ${Math.abs(floor)}층` : `${floor}층`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${y}.${m}.${d}`
}

export function formatYm(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}.${m}`
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** ISO 시각 → "2026.11.11 08:03" (한국시간) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const p = Object.fromEntries(KST.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}.${p.month}.${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

export function formatCount(n: number | null | undefined, unit = '건'): string {
  if (n == null) return '확인 불가'
  return `${n.toLocaleString('ko-KR')}${unit}`
}

/** YYYY-MM 을 n개월 이동 */
export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export function ymRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let c = from; c <= to; c = shiftYm(c, 1)) out.push(c)
  return out
}
