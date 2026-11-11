import { ExternalLink } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageTitle } from '@/components/ui/primitives'
import { ResourceView } from '@/components/ui/states'
import { ZONES } from '@/config/zones'
import { freshness, useManifest } from '@/lib/data'
import { formatDateTime, formatYm } from '@/lib/format'
import { hasKakaoKey } from '@/lib/kakao'
import type { Manifest, SourceStatus } from '@/types'

const SRC: Record<SourceStatus, { label: string; tone: 'accent' | 'warn' | 'up' }> = {
  connected: { label: '연결됨', tone: 'accent' },
  pending: { label: '연결 대기', tone: 'warn' },
  failed: { label: '조회 실패', tone: 'up' },
}

const FRESH = { pending: '연결 대기', fresh: '정상', stale: '갱신 지연', failed: '최근 조회 실패(이전 자료 표시 중)' }

function Status({ m }: { m: Manifest }) {
  const months = [...m.months].sort((a, b) => (a.ym < b.ym ? -1 : 1))
  const rows: [string, string][] = [
    ['상태', FRESH[freshness(m)]],
    ['마지막 정상 갱신', m.generatedAt ? formatDateTime(m.generatedAt) : '없음'],
    ['마지막 수집 시도', m.lastAttemptAt ? `${formatDateTime(m.lastAttemptAt)} · ${{ ok: '성공', partial: '부분 성공', failed: '실패' }[m.lastAttemptStatus ?? 'failed']}` : '없음'],
    ['수집 범위(계약월)', months.length ? `${formatYm(months[0].ym)} ~ ${formatYm(months[months.length - 1].ym)} (${months.length}개월)` : '없음'],
    ['매매 거래(해제 제외)', `${m.totals.trades.toLocaleString('ko-KR')}건`],
    ['해제 거래', `${m.totals.cancelled.toLocaleString('ko-KR')}건`],
    ['전월세 거래', m.rentMonths?.length ? `${(m.totals.rents ?? 0).toLocaleString('ko-KR')}건 (${m.rentMonths.length}개월)` : '연결되지 않음'],
    [
      '지역코드별 매매 수신(마지막 실행)',
      m.lawdCounts && Object.keys(m.lawdCounts).length
        ? Object.entries(m.lawdCounts)
            .map(([code, n]) => `${code}: ${n.toLocaleString('ko-KR')}건`)
            .join(' · ')
        : '기록 없음',
    ],
    ['단지', `${m.totals.complexes.toLocaleString('ko-KR')}곳 (좌표 확인 ${m.totals.geocoded.toLocaleString('ko-KR')}곳)`],
    ['대상 지역', `${m.region.name} (법정동 시군구코드 ${m.region.lawdCd})`],
  ]
  return (
    <>
      <dl className="grid gap-2.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
            <dt className="text-[12px] font-semibold text-muted">{k}</dt>
            <dd className="num text-sm font-bold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {m.lastAttemptMessage && <p className="mt-2.5 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">최근 시도 메시지: {m.lastAttemptMessage}</p>}
    </>
  )
}

export default function AboutPage() {
  const mres = useManifest()
  return (
    <div className="space-y-4">
      <PageTitle title="데이터 출처 · 갱신 정보" desc="어떤 자료를 언제 가져왔는지, 무엇이 아직 연결되지 않았는지 안내합니다" />

      <Card>
        <CardHeader title="데이터 상태" />
        <CardBody>
          <ResourceView res={mres} pendingWhenMissing={false}>
            {(m) => <Status m={m} />}
          </ResourceView>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="연결한 공식 데이터" />
        <ResourceView res={mres} pendingWhenMissing={false}>
          {(m) => (
            <ul className="divide-y divide-line pt-2">
              {m.sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-ink hover:underline">
                      {s.name} <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                    </a>
                    <span className="block text-[12px] text-muted">{s.provider}</span>
                  </span>
                  <Badge tone={SRC[s.status].tone}>{SRC[s.status].label}</Badge>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span>
                  <span className="text-sm font-bold text-ink">Kakao 지도 (브라우저 표시)</span>
                  <span className="block text-[12px] text-muted">Kakao Maps JavaScript SDK · 빌드 시 VITE_KAKAO_MAP_APP_KEY</span>
                </span>
                <Badge tone={hasKakaoKey ? 'accent' : 'warn'}>{hasKakaoKey ? '키 설정됨' : '연결 대기'}</Badge>
              </li>
            </ul>
          )}
        </ResourceView>
      </Card>

      <Card>
        <CardHeader title="연결 방법 (운영자용)" desc="자세한 절차는 저장소의 README.md 를 참고하세요" />
        <CardBody>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink">
            <li>공공데이터포털(data.go.kr)에서 ‘국토교통부 아파트 매매 실거래가 상세 자료’ 활용신청 후 인증키를 발급받습니다.</li>
            <li>
              GitHub 저장소 Settings → Secrets and variables → Actions 에 <code className="rounded bg-surface-2 px-1">MOLIT_API_KEY</code> 를 등록합니다.
            </li>
            <li>
              (선택) 단지 좌표용 <code className="rounded bg-surface-2 px-1">KAKAO_REST_API_KEY</code>, 지도 표시용{' '}
              <code className="rounded bg-surface-2 px-1">KAKAO_MAP_APP_KEY</code>(JavaScript 키, 도메인 제한 필수)를 등록합니다.
            </li>
            <li>Actions 탭에서 ‘데이터 수집 · 배포’ 워크플로를 실행하면 실제 자료가 반영됩니다. 이후 매일 자동으로 갱신됩니다.</li>
          </ol>
          <p className="mt-2 text-[12px] text-muted">공공데이터 인증키는 수집 서버(GitHub Actions)에서만 쓰이며 이 웹앱의 코드나 공개 JSON 에 포함되지 않습니다.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="읽을 때 유의할 점" />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink">
            <li>실거래가는 신고된 과거 계약 금액입니다. 현재 매물 호가·시세가 아닙니다.</li>
            <li>계약 후 30일 이내에 신고하므로 최근 한두 달의 거래량은 계속 늘어납니다. ‘계약일’과 ‘데이터 수집일’은 다릅니다.</li>
            <li>해제(취소)된 거래는 목록에 구분해 표시하고 통계에서는 뺍니다.</li>
            <li>이전에 수집된 거래가 최근 조회에서 사라지면 삭제하거나 해제로 간주하지 않고 ‘최근 조회 미확인’으로 표시한 뒤 통계에서 뺍니다(정정 가능성).</li>
            <li>월 중위 거래금액은 그 달에 거래된 단지·면적 구성의 영향을 받습니다. 시장 전체의 상승·하락으로 단정하지 마세요.</li>
            <li>단지 좌표는 지번 주소를 Kakao 주소 검색으로 변환한 값이며, 변환되지 않은 단지는 지도에 표시하지 않습니다.</li>
            <li>이 서비스는 투자·대출·세무 자문이 아닙니다.</li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="생활권 구분 기준" desc="실거래 자료는 법정동 단위입니다. 생활권은 탐색 편의를 위한 서비스용 구분입니다" />
        <div className="overflow-x-auto pt-2" tabIndex={0} role="group" aria-label="가로로 스크롤할 수 있는 표">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">생활권과 법정동 대응</caption>
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">생활권</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">종류</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">포함하는 법정동(이름 일치)</th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map((z) => (
                <tr key={z.id} className="border-b border-line/70 last:border-0 align-top">
                  <th scope="row" className="px-4 py-2.5 text-left font-bold whitespace-nowrap text-ink">{z.name}</th>
                  <td className="px-2 py-2.5 whitespace-nowrap">{z.approx ? <Badge tone="warn">{z.kind} · 근사</Badge> : <Badge>{z.kind}</Badge>}</td>
                  <td className="px-2 py-2.5 text-[13px] text-ink">
                    {z.match.join(', ')}
                    {z.note && <span className="block text-[12px] text-muted">{z.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
