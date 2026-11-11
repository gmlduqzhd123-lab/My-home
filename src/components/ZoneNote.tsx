import { Info } from 'lucide-react'
import { findZone } from '@/config/zones'

/** 법정동 경계와 일치하지 않는 생활권(택지지구)을 골랐을 때의 안내 */
export function ZoneNote({ zoneId }: { zoneId: string }) {
  const z = findZone(zoneId)
  if (!z?.approx || !z.note) return null
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-[12px] leading-relaxed text-warn">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <b>{z.name}</b>은(는) 서비스용 생활권 구분입니다. {z.note}
      </span>
    </p>
  )
}
