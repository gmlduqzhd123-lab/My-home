import { Bell, BellOff, CalendarPlus, Check, Copy, Download, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, PageTitle } from '@/components/ui/primitives'
import { LoadingBlock, NotAvailable, PendingState } from '@/components/ui/states'
import { notificationSupported, useAlerts } from '@/hooks/useAlerts'
import { calendarUrls, repoUrlFromPage, sortBySchedule, type AlertPhase } from '@/lib/alerts'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/format'
import { usePrefs } from '@/store/prefs'
import type { AlertItem } from '@/types'

const TONE: Record<AlertPhase['state'], 'accent' | 'warn' | 'neutral'> = { open: 'accent', upcoming: 'warn', closed: 'neutral', unknown: 'neutral' }

function range(a: string | null, b: string | null): string | null {
  if (!a && !b) return null
  return a && b && a !== b ? `${formatDate(a)} ~ ${formatDate(b)}` : formatDate(a ?? b)
}

function Row({ item, phase, isNew }: { item: AlertItem; phase?: AlertPhase; isNew?: boolean }) {
  const receipt = item.receiptStart ? range(item.receiptStart, item.receiptEnd) : null
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          {phase && <Badge tone={TONE[phase.state]}>{phase.label}</Badge>}
          {isNew && <Badge tone="up">새 공고</Badge>}
          <span className="text-sm font-bold text-ink">{item.title}</span>
        </p>
        <p className="num mt-1 text-[12px] leading-relaxed text-muted">
          {item.kind}
          {item.location && ` · ${item.location.replace(/^.*순천시\s*/, '순천시 ')}`}
          {item.households != null && ` · ${item.households.toLocaleString('ko-KR')}세대`}
        </p>
        <p className="num text-[12px] leading-relaxed text-muted">
          {item.announceDate && `공고 ${formatDate(item.announceDate)}`}
          {receipt ? ` · 접수 ${receipt}` : item.receiptEnd ? ` · 마감 ${formatDate(item.receiptEnd)}` : ' · 접수 일정 공고 확인 불가'}
          {item.winnerDate && ` · 발표 ${formatDate(item.winnerDate)}`}
        </p>
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${item.title} 공고 원문 열기`}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-[13px] font-semibold text-accent-ink hover:bg-surface-2"
        >
          공고 <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </li>
  )
}

function NotifyToggle() {
  const enabled = usePrefs((s) => s.notify)
  const setNotify = usePrefs((s) => s.setNotify)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationSupported() ? Notification.permission : 'unsupported',
  )
  const on = enabled && permission === 'granted'

  const toggle = async () => {
    if (on) return setNotify(false)
    if (permission === 'unsupported') return
    const p = permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(p)
    setNotify(p === 'granted')
  }

  return (
    <div>
      <Button variant={on ? 'soft' : 'outline'} aria-pressed={on} onClick={() => void toggle()} disabled={permission === 'unsupported'}>
        {on ? <Bell /> : <BellOff />} {on ? '브라우저 알림 켜짐' : '브라우저 알림 켜기'}
      </Button>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted" role="status">
        {permission === 'unsupported'
          ? '이 브라우저는 알림을 지원하지 않습니다.'
          : permission === 'denied'
            ? '브라우저에서 이 사이트의 알림이 차단되어 있습니다. 주소창의 사이트 설정에서 알림을 허용해 주세요.'
            : on
              ? '이 사이트를 열었을 때 새 공고가 있으면 알림을 띄웁니다. 사이트를 닫아 둔 동안에는 알림이 오지 않습니다.'
              : '켜 두면 이 사이트를 열었을 때 새 공고를 알림으로 알려 줍니다.'}
      </p>
    </div>
  )
}

function HowTo() {
  const [copied, setCopied] = useState(false)
  const urls = calendarUrls(import.meta.env.BASE_URL, window.location.href)
  const repo = repoUrlFromPage(window.location.href)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(urls.https)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Card>
      <CardHeader title="알림 받는 방법" desc="서버와 회원가입이 없는 서비스라, 아래 방법 중 맞는 것을 골라 쓰세요" />
      <CardBody className="space-y-5">
        <section>
          <h3 className="mb-1 text-[13px] font-bold text-ink">1. 캘린더로 받기 (추천)</h3>
          <p className="mb-2 text-[13px] leading-relaxed text-muted">
            청약 접수·당첨자 발표·공고 마감 일정을 휴대폰이나 PC 캘린더에 넣습니다. ‘구독’하면 새 공고가 생길 때 캘린더가 스스로 갱신하고,
            접수 시작 전날 오전 9시에 캘린더 앱이 알려 줍니다. 사이트를 열지 않아도 알림이 옵니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <a href={urls.webcal}>
                <CalendarPlus /> 캘린더 구독
              </a>
            </Button>
            <Button asChild>
              <a href={urls.https} download="suncheon-zip-청약일정.ics">
                <Download /> 일정 파일 받기
              </a>
            </Button>
            <Button onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? '복사됨' : '구독 주소 복사'}
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            ‘캘린더 구독’이 열리지 않으면 주소를 복사해 캘린더 앱의 ‘URL 로 추가’(Google 캘린더: 다른 캘린더 → URL 로 추가)에 붙여 넣으세요.
            ‘일정 파일 받기’는 지금 일정만 한 번 넣는 방식이라 이후 새 공고는 반영되지 않습니다. 갱신 주기는 캘린더 앱마다 다릅니다.
          </p>
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-bold text-ink">2. 이 사이트에서 확인하기</h3>
          <p className="mb-2 text-[13px] leading-relaxed text-muted">
            마지막으로 확인한 뒤 새로 올라온 공고가 있으면 상단 종 모양에 숫자가 표시됩니다.
          </p>
          <NotifyToggle />
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-bold text-ink">3. 메일로 받기</h3>
          <p className="text-[13px] leading-relaxed text-muted">
            새 공고가 수집되면 이 서비스의 GitHub 저장소에 ‘새 청약 공고’ 이슈가 자동으로 만들어집니다. GitHub 계정으로 저장소를 Watch(사용자
            지정 → Issues)해 두면 GitHub 가 메일로 알려 줍니다.
            {repo && (
              <>
                {' '}
                <a href={`${repo}/issues`} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline underline-offset-2">
                  저장소 이슈 열기
                </a>
              </>
            )}
          </p>
        </section>
      </CardBody>
    </Card>
  )
}

export default function AlertsPage() {
  const { file, loading, fresh, today } = useAlerts()
  const markSeen = usePrefs((s) => s.markAlertsSeen)
  const [showClosed, setShowClosed] = useState(false)

  const freshIds = new Set(fresh.map((i) => i.id))
  const sorted = file ? sortBySchedule(file.items, today) : []
  const active = sorted.filter((x) => x.phase.state !== 'closed')
  const closed = sorted.filter((x) => x.phase.state === 'closed')

  return (
    <div className="space-y-4">
      <PageTitle title="순천 청약 알림" desc="청약홈 분양 공고와 LH 분양·임대 공고의 새 소식과 일정" />

      {loading ? (
        <Card>
          <LoadingBlock rows={4} />
        </Card>
      ) : !file || file.status === 'pending' ? (
        <Card>
          <PendingState title="청약 공고 연결 대기 중">
            청약홈 분양정보와 LH 공고가 아직 수집되지 않았습니다. 공공데이터포털에서 ‘청약홈 분양정보 조회 서비스’, ‘한국토지주택공사_분양임대공고문
            조회 서비스’를 활용신청하면 다음 수집부터 공고와 일정이 표시됩니다.
          </PendingState>
        </Card>
      ) : (
        <>
          {file.status === 'failed' && (
            <p role="alert" className="rounded-2xl bg-up-soft px-4 py-3 text-[13px] font-medium text-up">
              최근 수집에서 청약 공고를 가져오지 못했습니다. {file.items.length > 0 ? '아래는 마지막으로 확인된 내용이며, 새 공고가 빠져 있을 수 있습니다.' : '활용신청 승인 여부를 확인해 주세요.'}
            </p>
          )}
          {(file.sources.presale !== 'ok' || file.sources.lh !== 'ok') && file.status === 'ok' && (
            <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] font-medium text-warn" role="status">
              {file.sources.presale !== 'ok' ? '청약홈 분양 공고' : 'LH 공고'}는 아직 연결되지 않아 {file.sources.presale !== 'ok' ? 'LH 공고' : '청약홈 분양 공고'}만
              표시합니다.
            </p>
          )}

          <Card>
            <CardHeader
              title={`새로 확인된 공고 ${fresh.length}건`}
              desc="마지막으로 확인한 뒤 수집된 공고 (처음 방문했다면 최근 14일 안에 공고된 것)"
              action={
                fresh.length > 0 ? (
                  <Button size="sm" variant="primary" onClick={() => markSeen(file.generatedAt)}>
                    <Check /> 모두 확인
                  </Button>
                ) : undefined
              }
            />
            {fresh.length === 0 ? (
              <NotAvailable title="새 공고가 없습니다" className="py-6">
                공고 수집 {formatDateTime(file.generatedAt)} 기준입니다.
              </NotAvailable>
            ) : (
              <ul className="divide-y divide-line pt-2">
                {fresh.map((i) => (
                  <Row key={i.id} item={i} phase={sorted.find((x) => x.item.id === i.id)?.phase} isNew />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="청약 일정" desc="접수 중 → 접수 예정 순 · 날짜는 한국시간 기준" />
            {active.length === 0 ? (
              <NotAvailable title="진행 중이거나 예정된 청약이 없습니다" className="py-6" />
            ) : (
              <ul className="divide-y divide-line pt-2">
                {active.map(({ item, phase }) => (
                  <Row key={item.id} item={item} phase={phase} isNew={freshIds.has(item.id)} />
                ))}
              </ul>
            )}
            {closed.length > 0 && (
              <div className="border-t border-line">
                <button
                  type="button"
                  aria-expanded={showClosed}
                  onClick={() => setShowClosed((v) => !v)}
                  className="w-full cursor-pointer px-4 py-3 text-left text-[13px] font-semibold text-muted hover:bg-surface-2/60 sm:px-5"
                >
                  마감된 공고 {closed.length}건 {showClosed ? '접기' : '보기'}
                </button>
                {showClosed && (
                  <ul className={cn('divide-y divide-line border-t border-line')}>
                    {closed.slice(0, 30).map(({ item, phase }) => (
                      <Row key={item.id} item={item} phase={phase} />
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="num border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted sm:px-5">
              출처: 한국부동산원 청약홈 분양정보, 한국토지주택공사 분양임대공고(공공데이터포털) · 수집 {formatDateTime(file.generatedAt)}. LH 공고는
              접수 시작일이 목록 자료에 없어 마감일만 표시합니다. 자격·일정은 반드시 공고 원문으로 확인하세요.
            </p>
          </Card>
        </>
      )}

      <HowTo />
    </div>
  )
}
