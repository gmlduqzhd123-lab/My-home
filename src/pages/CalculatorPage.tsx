import { useMemo, useState } from 'react'
import { Delta } from '@/components/Delta'
import { Card, CardBody, CardHeader, Field, Input, PageTitle, Segmented } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { parseNum } from '@/lib/filters'
import { formatPrice } from '@/lib/format'
import { calcLoan, type RepayMethod } from '@/lib/loan'

/** 만원 단위(소수 포함) → "123만 4,000원" 수준이 아닌 원 단위 반올림 표기 */
function won(manwon: number): string {
  return `${Math.round(manwon * 10000).toLocaleString('ko-KR')}원`
}

export default function CalculatorPage() {
  const [price, setPrice] = useState('30000')
  const [cash, setCash] = useState('10000')
  const [loan, setLoan] = useState('20000')
  const [rate, setRate] = useState('4.0')
  const [years, setYears] = useState('30')
  const [method, setMethod] = useState<RepayMethod>('annuity')

  const r = useMemo(
    () =>
      calcLoan({
        price: parseNum(price) ?? 0,
        cash: parseNum(cash) ?? 0,
        loan: parseNum(loan) ?? 0,
        ratePct: parseNum(rate) ?? 0,
        years: parseNum(years) ?? 0,
        method,
      }),
    [price, cash, loan, rate, years, method],
  )
  const yearly = useMemo(() => r.schedule.filter((row) => row.month % 12 === 0 || row.month === r.months), [r])
  const money = (label: string, v: string, set: (s: string) => void) => (
    <Field label={`${label} (만원)`} hint={parseNum(v) != null ? formatPrice(parseNum(v)) + '원' : undefined}>
      <Input inputMode="numeric" value={v} onChange={(e) => setter(set, e.target.value)} />
    </Field>
  )
  const setter = (set: (s: string) => void, v: string) => set(v.replace(/[^\d.,]/g, ''))

  return (
    <div className="space-y-4">
      <PageTitle title="부동산 계산기" desc="입력한 숫자로만 계산하는 단순 산식입니다" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader title="입력" />
          <CardBody className="space-y-3">
            {money('매매가격', price, setPrice)}
            {money('보유 현금', cash, setCash)}
            {money('대출금액', loan, setLoan)}
            <div className="grid grid-cols-2 gap-3">
              <Field label="대출금리 (연 %)">
                <Input inputMode="decimal" value={rate} onChange={(e) => setter(setRate, e.target.value)} />
              </Field>
              <Field label="대출기간 (년)">
                <Input inputMode="numeric" value={years} onChange={(e) => setter(setYears, e.target.value)} />
              </Field>
            </div>
            <div>
              <p className="mb-1 text-[12px] font-semibold text-muted">상환 방식</p>
              <Segmented
                label="상환 방식"
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'annuity', label: '원리금균등' },
                  { value: 'principal', label: '원금균등' },
                ]}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="계산 결과" desc={method === 'annuity' ? '원리금균등: 매달 같은 금액 상환' : '원금균등: 원금은 매달 같고 이자는 줄어듦'} />
          <CardBody>
            {!r.valid ? (
              <ul role="alert" className="list-disc space-y-1 pl-5 text-[13px] font-medium text-up">
                {r.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-2.5">
                  {[
                    [method === 'annuity' ? '월 상환액' : '첫 달 상환액', won(r.firstPayment)],
                    [method === 'annuity' ? '총 상환액' : '마지막 달 상환액', won(method === 'annuity' ? r.totalPayment : r.lastPayment)],
                    ['총이자', won(r.totalInterest)],
                    ['필요 현금 (매매가격 − 대출금액)', `${formatPrice(r.requiredCash)}원`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                      <dt className="text-[12px] font-semibold text-muted">{k}</dt>
                      <dd className="num text-base font-extrabold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className={cn('mt-2.5 rounded-xl px-3.5 py-2.5', r.cashGap < 0 ? 'bg-up-soft' : 'bg-accent-soft')}>
                  <p className="text-[12px] font-semibold text-muted">보유 현금 − 필요 현금</p>
                  <p className="num text-base font-extrabold text-ink">
                    {r.cashGap < 0 ? `${formatPrice(-r.cashGap)}원 부족` : `${formatPrice(r.cashGap)}원 여유`}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">취득세·중개보수·등기 비용·이사비는 포함하지 않았습니다.</p>
                </div>
                {r.loanRatioPct != null && (
                  <p className="num mt-2 text-[12px] text-muted">
                    매매가격 대비 대출금액 {r.loanRatioPct.toFixed(1)}% — 단순 비율이며 금융기관의 담보인정비율(LTV) 심사 결과가 아닙니다.
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {r.valid && yearly.length > 0 && (
        <Card>
          <CardHeader title="연차별 상환 일정" desc="각 연차 마지막 달 기준" />
          <div className="overflow-x-auto pt-2" tabIndex={0} role="group" aria-label="가로로 스크롤할 수 있는 표">
            <table className="num w-full min-w-[520px] text-sm">
              <caption className="sr-only">연차별 상환 일정</caption>
              <thead>
                <tr className="border-b border-line text-[12px] text-muted">
                  {['회차', '월 상환액', '원금', '이자', '대출 잔액'].map((h, i) => (
                    <th key={h} scope="col" className={cn('px-4 py-2.5 font-semibold', i === 0 ? 'text-left' : 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearly.map((row) => (
                  <tr key={row.month} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-semibold text-ink">
                      {Math.ceil(row.month / 12)}년차 ({row.month}회)
                    </th>
                    <td className="px-4 py-2 text-right">{won(row.payment)}</td>
                    <td className="px-4 py-2 text-right">{won(row.principal)}</td>
                    <td className="px-4 py-2 text-right">{won(row.interest)}</td>
                    <td className="px-4 py-2 text-right">{won(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="이 계산기가 하지 않는 것" />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink">
            <li>
              <b>취득세 자동 계산은 제공하지 않습니다.</b> 세율은 주택 수·취득가액·면적·감면 요건과 적용 기준일에 따라 달라져, 조건을 확인할 수
              없는 상태에서 숫자를 제시하지 않습니다. 위택스·세무 전문가에게 확인하세요.
            </li>
            <li>
              <b>정책성 대출(디딤돌·보금자리론 등) 자격·한도 판단은 제공하지 않습니다.</b> 소득·자산·주택가격 요건이 수시로 바뀝니다.
            </li>
            <li>금리 변동, 거치기간, 중도상환, 수수료, DSR·LTV 규제는 반영하지 않은 단순 산식입니다. 실제 대출 조건은 금융기관에서 확인하세요.</li>
          </ul>
          <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
            금액 차이 표기 예: <Delta diff={1200} /> <Delta diff={-800} /> (상승 빨강 ▲, 하락 파랑 ▼)
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
