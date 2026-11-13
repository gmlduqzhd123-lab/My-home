import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapPinOff } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SUNCHEON_CENTER } from '@/config/zones'
import { cn } from '@/lib/cn'
import type { Complex } from '@/types'

export type MapStatus = 'loading' | 'ready' | 'error'

/**
 * OpenStreetMap 배경지도(키 불필요). 타일 이용 정책상 출처 표시를 반드시 남긴다.
 * https://operations.osmfoundation.org/policies/tiles/
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> 기여자'

const MARKER = { radius: 7, color: '#ffffff', weight: 2, fillColor: '#00a88f', fillOpacity: 0.95 }
const MARKER_SELECTED = { radius: 10, color: '#ffffff', weight: 3, fillColor: '#14233B', fillOpacity: 1 }

function MapNotice({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-2 bg-surface-2 p-6 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-warn-soft text-warn">{icon}</div>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  )
}

/**
 * 단지 위치 지도(Leaflet + OpenStreetMap). 좌표(lat/lng)가 확인된 단지만 표시한다.
 * fitKey 가 바뀌면 표시 단지 전체가 보이도록 범위를 맞춘다.
 */
export function ComplexMap({
  complexes,
  selectedId,
  onSelect,
  className,
  fitKey,
  onStatus,
}: {
  complexes: Complex[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  className?: string
  fitKey?: string
  onStatus?: (s: MapStatus) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const ctx = useRef<{ map: L.Map; layer: L.LayerGroup; markers: Map<string, L.CircleMarker> } | null>(null)
  const [status, setStatus] = useState<MapStatus>('loading')
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const withCoord = complexes.filter((c) => c.lat != null && c.lng != null)

  useEffect(() => {
    onStatus?.(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!el.current) return
    let map: L.Map
    try {
      map = L.map(el.current, { center: [SUNCHEON_CENTER.lat, SUNCHEON_CENTER.lng], zoom: 12, zoomControl: true })
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
      map.attributionControl.setPrefix(false)
    } catch {
      setStatus('error')
      return
    }
    const layer = L.layerGroup().addTo(map)
    ctx.current = { map, layer, markers: new Map() }
    // 부모 크기가 뒤늦게 정해지는 레이아웃(하단 시트·그리드)에서도 타일이 맞게 그려지도록
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null
    ro?.observe(el.current)
    setStatus('ready')
    return () => {
      ro?.disconnect()
      map.remove()
      ctx.current = null
    }
  }, [])

  // 마커 갱신
  useEffect(() => {
    const c = ctx.current
    if (status !== 'ready' || !c) return
    c.layer.clearLayers()
    c.markers.clear()
    const pts: L.LatLngExpression[] = []
    for (const x of withCoord) {
      const pos: L.LatLngExpression = [x.lat!, x.lng!]
      const m = L.circleMarker(pos, MARKER).bindTooltip(x.name, { direction: 'top', offset: [0, -6] })
      m.on('click', () => onSelectRef.current?.(x.id))
      m.addTo(c.layer)
      c.markers.set(x.id, m)
      pts.push(pos)
    }
    if (pts.length > 1) c.map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 16 })
    else if (pts.length === 1) c.map.setView(pts[0], 16)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fitKey ?? complexes])

  // 선택 단지 강조
  useEffect(() => {
    const c = ctx.current
    if (status !== 'ready' || !c) return
    for (const [id, m] of c.markers) {
      const on = id === selectedId
      m.setStyle(on ? MARKER_SELECTED : MARKER)
      m.setRadius(on ? MARKER_SELECTED.radius : MARKER.radius)
      if (on) {
        m.bringToFront()
        m.openTooltip()
      } else m.closeTooltip()
    }
    const sel = complexes.find((x) => x.id === selectedId)
    if (sel?.lat != null && sel.lng != null) c.map.setView([sel.lat, sel.lng], Math.max(c.map.getZoom(), 15))
  }, [status, selectedId, complexes, fitKey])

  return (
    <div className={cn('relative isolate overflow-hidden', className)}>
      <div ref={el} className="absolute inset-0 z-0" aria-label="순천시 아파트 단지 지도" role="application" />
      {status === 'error' && (
        <MapNotice icon={<MapPinOff className="size-5" />} title="지도를 불러오지 못했습니다" className="absolute inset-0 z-10">
          지도 초기화에 실패했습니다. 단지 목록은 그대로 사용할 수 있습니다.
        </MapNotice>
      )}
      {status === 'ready' && complexes.length > 0 && withCoord.length === 0 && (
        <p role="status" className="pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto flex max-w-md items-start gap-1.5 rounded-lg bg-surface/95 px-3 py-2 text-[12px] font-medium text-warn shadow">
          <MapPinOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {complexes.length === 1 ? '이 단지는 좌표가 확인되지 않아 지도에 위치를 표시하지 못했습니다.' : '단지 좌표가 아직 확인되지 않아 지도에 위치를 표시하지 못했습니다. 목록으로 탐색할 수 있습니다.'}
        </p>
      )}
    </div>
  )
}
