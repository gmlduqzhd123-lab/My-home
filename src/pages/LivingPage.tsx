import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ComplexPicker } from '@/components/ComplexPicker'
import { NearbyPlaces, OfficialSchoolLinks } from '@/components/NearbyPlaces'
import { SchoolList } from '@/components/Schools'
import { Badge, Card, CardBody, CardHeader, PageTitle } from '@/components/ui/primitives'
import { PendingState, ResourceView } from '@/components/ui/states'
import { useComplexes, useManifest } from '@/lib/data'
import type { Complex } from '@/types'

function Finder({ complexes }: { complexes: Complex[] }) {
  const [id, setId] = useState<string | null>(null)
  const c = complexes.find((x) => x.id === id) ?? null
  return (
    <Card>
      <CardHeader title="단지 주변 시설 찾기" desc="단지를 고르면 좌표 기준 직선거리로 학교·병원·약국·마트·공원·버스정류장을 조회합니다(OpenStreetMap)" />
      <CardBody>
        <ComplexPicker complexes={complexes} exclude={id ? [id] : []} onPick={setId} placeholder="단지 검색" />
        {c && (
          <p className="mt-3 text-sm font-bold text-ink">
            {c.name}{' '}
            <Link to={`/complex/${c.id}`} className="text-[13px] font-semibold text-accent-ink underline underline-offset-2">
              단지 상세
            </Link>
          </p>
        )}
      </CardBody>
      {c && <NearbyPlaces lat={c.lat} lng={c.lng} />}
    </Card>
  )
}

export default function LivingPage() {
  const mres = useManifest()
  const ready = mres.status === 'ok' && mres.data.status === 'ok'
  const cres = useComplexes(ready)
  return (
    <div className="space-y-4">
      <PageTitle title="학군 · 생활환경" desc="공식 자료 링크와 단지 주변 시설 조회" action={<Badge tone="warn">2단계 기능 · 일부 연계</Badge>} />

      <Card>
        <CardHeader title="학교 배정은 공식 서비스에서 확인하세요" />
        <CardBody className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink">
            단지에서 가까운 학교가 배정 학교라는 보장은 없습니다. 초등학교 통학구역과 중·고등학교 학교군은 교육청 고시로 정해지며 해마다
            조정될 수 있습니다. 이 서비스는 거리만 보여 주고 배정 학교를 판단하지 않습니다.
          </p>
          <OfficialSchoolLinks />
        </CardBody>
      </Card>

      {mres.status === 'ok' && !ready ? (
        <Card>
          <PendingState />
        </Card>
      ) : (
        <ResourceView res={mres}>{() => <ResourceView res={cres}>{(list) => <Finder complexes={list} />}</ResourceView>}</ResourceView>
      )}

      <Card>
        <CardHeader title="순천시 학교 목록" desc="순천교육지원청 관할 초·중·고 (운영 중인 학교)" />
        <SchoolList />
      </Card>

      <Card>
        <CardHeader title="연계 현황" />
        <CardBody>
          <ul className="space-y-2 text-[13px] leading-relaxed text-ink">
            <li>
              <Badge tone="accent">구현</Badge> 단지 좌표 주변의 학교·병원·약국·대형마트·편의점·공원·버스정류장 조회 (OpenStreetMap, 단지 좌표 필요)
            </li>
            <li>
              <Badge tone="accent">구현</Badge> 학교 목록과 단지별 가까운 학교 (전국초중등학교위치표준데이터 — 활용신청 후 수집되면 표시)
            </li>
            <li>
              <Badge tone="warn">미연계</Badge> 통학구역 경계 — 공개 API 가 확인되지 않아 공식 사이트 링크로 안내합니다.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}
