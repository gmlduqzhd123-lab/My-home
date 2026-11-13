import { Download, ExternalLink, Play, Square } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Input, PageTitle } from '@/components/ui/primitives'
import { ResourceView } from '@/components/ui/states'
import { useComplexes } from '@/lib/data'
import { buildUrl, jsonp, parsePoint, queriesFor, VworldError, type VworldResponse } from '@/lib/vworld'
import type { Complex } from '@/types'

const VWORLD_SOURCE = '브이월드 지오코더'

type RowState = { status: 'wait' | 'ok' | 'miss' | 'error'; lat?: number; lng?: number; query?: string; note?: string }

interface ManualEntry {
  lat: number
  lng: number
  source: string
  query: string | null
  at: string
}

/** 이 사이트 주소(https://계정.github.io/저장소/)에서 GitHub 업로드 주소를 만든다 */
function uploadUrl(): string | null {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/)
  const repo = location.pathname.split('/').filter(Boolean)[0]
  return m && repo ? `https://github.com/${m[1]}/${repo}/upload/main/data-cache` : null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function Tool({ complexes }: { complexes: Complex[] }) {
  const [key, setKey] = useState('')
  const [redo, setRedo] = useState(false)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [running, setRunning] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const stop = useRef(false)

  // 이미 브이월드로 찾아 올린 단지는 파일에 그대로 다시 넣어(덮어써도 사라지지 않게) 검색은 건너뛴다
  const kept = useMemo(() => complexes.filter((c) => c.lat != null && c.coordSource === VWORLD_SOURCE), [complexes])
  const targets = useMemo(
    () => complexes.filter((c) => c.coordSource !== VWORLD_SOURCE && (redo || c.lat == null) && queriesFor(c).length > 0),
    [complexes, redo],
  )
  const done = Object.values(rows).filter((r) => r.status !== 'wait').length
  const found = Object.values(rows).filter((r) => r.status === 'ok').length

  async function run() {
    const k = key.trim()
    if (!k) return
    stop.current = false
    setFatal(null)
    setRunning(true)
    setRows(Object.fromEntries(targets.map((c) => [c.id, { status: 'wait' } as RowState])))
    for (const c of targets) {
      if (stop.current) break
      let row: RowState = { status: 'miss', note: '주소로 찾지 못함' }
      try {
        for (const [q, type] of queriesFor(c)) {
          const hit = parsePoint(await jsonp<VworldResponse>(buildUrl(k, q, type)))
          await sleep(150)
          if (hit) {
            row = { status: 'ok', lat: hit.lat, lng: hit.lng, query: q, note: hit.refined }
            break
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        row = { status: 'error', note: msg }
        if (e instanceof VworldError && e.fatal) {
          setRows((cur) => ({ ...cur, [c.id]: row }))
          setFatal(msg)
          break
        }
      }
      setRows((cur) => ({ ...cur, [c.id]: row }))
    }
    setRunning(false)
  }

  function download() {
    const now = new Date().toISOString()
    const out: Record<string, ManualEntry> = {}
    for (const c of kept) out[c.id] = { lat: c.lat!, lng: c.lng!, source: VWORLD_SOURCE, query: null, at: now }
    for (const [id, r] of Object.entries(rows)) {
      if (r.status === 'ok') out[id] = { lat: r.lat!, lng: r.lng!, source: VWORLD_SOURCE, query: r.query ?? null, at: now }
    }
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'geocode-manual.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const up = uploadUrl()
  const byId = new Map(complexes.map((c) => [c.id, c]))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. 브이월드 키 입력 후 시작" desc="키는 이 화면에서만 쓰고 저장하지 않습니다. 국내 인터넷에서 열어야 동작합니다" />
        <CardBody className="space-y-3">
          <Input
            type="password"
            autoComplete="off"
            aria-label="브이월드 인증키"
            placeholder="브이월드 인증키"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={running}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} disabled={running} />
            OpenStreetMap으로 이미 찾은 단지도 브이월드 주소 좌표로 다시 찾기(더 정확)
          </label>
          <p className="num text-[13px] text-muted">
            검색할 단지 {targets.length.toLocaleString('ko-KR')}곳
            {kept.length > 0 && ` · 이미 브이월드로 찾은 단지 ${kept.length}곳은 그대로 유지`}
          </p>
          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button variant="outline" onClick={() => (stop.current = true)}>
                <Square /> 멈추기
              </Button>
            ) : (
              <Button variant="primary" onClick={run} disabled={!key.trim() || targets.length === 0}>
                <Play /> 위치 찾기 시작
              </Button>
            )}
          </div>
          {Object.keys(rows).length > 0 && (
            <p className="num text-sm font-bold text-ink" role="status">
              {done} / {Object.keys(rows).length} 확인 · 찾음 {found}곳
            </p>
          )}
          {fatal && (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn" role="alert">
              {fatal} — 키가 맞는지, 브이월드 인증키의 서비스 URL 에 이 사이트 주소({location.origin})가 등록되어 있는지 확인해 주세요.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. 결과 파일 내려받기" desc="파일 이름은 바꾸지 마세요: geocode-manual.json" />
        <CardBody>
          <Button variant="primary" onClick={download} disabled={running || found + kept.length === 0}>
            <Download /> geocode-manual.json 내려받기 ({found + kept.length}곳)
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="3. GitHub 에 올리기" />
        <CardBody className="space-y-2 text-[13px] leading-relaxed text-ink">
          <p>
            아래 버튼으로 저장소의 <code className="rounded bg-surface-2 px-1">data-cache</code> 폴더 업로드 화면을 열고, 내려받은 파일을 끌어다 놓거나
            <b>choose your files</b> 로 고른 뒤 맨 아래 <b>Commit changes</b> 를 누르세요. 같은 이름의 파일이 있으면 새 파일로 바뀝니다. 올리면 자동으로 수집이 다시 돌아 몇 분 뒤 지도에 반영됩니다.
          </p>
          {up ? (
            <a href={up} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-ink underline underline-offset-2">
              GitHub 업로드 화면 열기 <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-muted">GitHub 저장소 → data-cache 폴더 → Add file → Upload files</p>
          )}
        </CardBody>
      </Card>

      {Object.keys(rows).length > 0 && (
        <Card>
          <CardHeader title="결과" />
          <ul className="divide-y divide-line">
            {Object.entries(rows).map(([id, r]) => (
              <li key={id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] sm:px-5">
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink">{byId.get(id)?.name}</span>
                  <span className="block truncate text-[12px] text-muted">{r.note ?? byId.get(id)?.address}</span>
                </span>
                <Badge tone={r.status === 'ok' ? 'accent' : r.status === 'wait' ? 'neutral' : 'warn'}>
                  {{ wait: '대기', ok: '찾음', miss: '못 찾음', error: '오류' }[r.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/** 운영자용: 브이월드로 단지 좌표를 찾아 파일로 내려받는 화면(메뉴에 없음, 주소 #/tools/geocode) */
export default function GeocodeToolPage() {
  const cres = useComplexes(true)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title="단지 위치 채우기 (운영자용)" desc="지도에 위치가 없는 단지를 브이월드 주소 검색으로 찾습니다" />
      <ResourceView res={cres}>{(list) => <Tool complexes={list} />}</ResourceView>
    </div>
  )
}
