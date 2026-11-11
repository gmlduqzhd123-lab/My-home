import { MapPinOff, PlugZap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SUNCHEON_CENTER } from '@/config/zones'
import { cn } from '@/lib/cn'
import { hasKakaoKey, loadKakao, type KakaoNS, type KClusterer, type KMap, type KMarker, type KOverlay } from '@/lib/kakao'
import type { Complex } from '@/types'

export type MapStatus = 'no_key' | 'loading' | 'ready' | 'error'

function MapFallback({ status, className }: { status: MapStatus; className?: string }) {
  const noKey = status === 'no_key'
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-2 bg-surface-2 p-6 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-warn-soft text-warn">
        {noKey ? <PlugZap className="size-5" /> : <MapPinOff className="size-5" />}
      </div>
      <p className="text-[15px] font-bold text-ink">{noKey ? '지도 연결 대기 중' : '지도를 불러오지 못했습니다'}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted">
        {noKey
          ? 'Kakao 지도 JavaScript 키(VITE_KAKAO_MAP_APP_KEY)가 설정되지 않았습니다. 지도 없이도 단지 목록과 검색은 그대로 사용할 수 있습니다.'
          : 'Kakao 지도 SDK 로딩에 실패했습니다. 키의 JavaScript SDK 도메인 등록과 네트워크 상태를 확인해 주세요. 단지 목록은 그대로 사용할 수 있습니다.'}
      </p>
    </div>
  )
}

/**
 * 단지 마커 지도. 좌표(lat/lng)가 확인된 단지만 표시한다.
 * fitKey 가 바뀌면 표시 단지 전체가 보이도록 범위를 맞춘다.
 */
export function KakaoMap({
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
  const ctx = useRef<{ kakao: KakaoNS; map: KMap; clusterer: KClusterer; markers: Map<string, KMarker>; overlay: KOverlay | null } | null>(null)
  const [status, setStatus] = useState<MapStatus>(hasKakaoKey ? 'loading' : 'no_key')
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    onStatus?.(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!hasKakaoKey) return
    let alive = true
    loadKakao().then(
      (kakao) => {
        if (!alive || !el.current) return
        const map = new kakao.maps.Map(el.current, {
          center: new kakao.maps.LatLng(SUNCHEON_CENTER.lat, SUNCHEON_CENTER.lng),
          level: 8,
        })
        const clusterer = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 5, gridSize: 60 })
        ctx.current = { kakao, map, clusterer, markers: new Map(), overlay: null }
        setStatus('ready')
      },
      () => alive && setStatus('error'),
    )
    return () => {
      alive = false
    }
  }, [])

  // 마커 갱신
  useEffect(() => {
    const c = ctx.current
    if (status !== 'ready' || !c) return
    c.clusterer.clear()
    c.markers.clear()
    const bounds = new c.kakao.maps.LatLngBounds()
    const list: KMarker[] = []
    for (const x of complexes) {
      if (x.lat == null || x.lng == null) continue
      const pos = new c.kakao.maps.LatLng(x.lat, x.lng)
      const m = new c.kakao.maps.Marker({ position: pos, title: x.name, clickable: true })
      c.kakao.maps.event.addListener(m, 'click', () => onSelectRef.current?.(x.id))
      c.markers.set(x.id, m)
      list.push(m)
      bounds.extend(pos)
    }
    c.clusterer.addMarkers(list)
    if (list.length > 1) c.map.setBounds(bounds)
    else if (list.length === 1) {
      c.map.setCenter(list[0].getPosition())
      c.map.setLevel(4)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fitKey ?? complexes])

  // 선택 단지 강조
  useEffect(() => {
    const c = ctx.current
    if (status !== 'ready' || !c) return
    c.overlay?.setMap(null)
    c.overlay = null
    const sel = complexes.find((x) => x.id === selectedId)
    if (!sel || sel.lat == null || sel.lng == null) return
    const pos = new c.kakao.maps.LatLng(sel.lat, sel.lng)
    const label = document.createElement('div')
    label.textContent = sel.name
    label.style.cssText =
      'background:#14233B;color:#fff;font:700 12px/1 system-ui,sans-serif;padding:6px 9px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);transform:translateY(-44px)'
    c.overlay = new c.kakao.maps.CustomOverlay({ position: pos, content: label, yAnchor: 1, zIndex: 10 })
    c.overlay.setMap(c.map)
    if (c.map.getLevel() > 5) c.map.setLevel(4)
    c.map.panTo(pos)
  }, [status, selectedId, complexes])

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div ref={el} className="absolute inset-0" aria-label="순천시 아파트 단지 지도" role="application" />
      {status === 'loading' && <div className="skeleton absolute inset-0 rounded-none" aria-label="지도를 불러오는 중" role="status" />}
      {(status === 'no_key' || status === 'error') && <MapFallback status={status} className="absolute inset-0" />}
    </div>
  )
}
