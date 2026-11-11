export type RepayMethod = 'annuity' | 'principal' // 원리금균등 / 원금균등

export interface LoanInput {
  price: number // 매매가격(만원)
  cash: number // 보유 현금(만원)
  loan: number // 대출금액(만원)
  ratePct: number // 연 이자율(%)
  years: number // 대출기간(년)
  method: RepayMethod
}

export interface LoanRow {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

export interface LoanResult {
  valid: boolean
  errors: string[]
  months: number
  firstPayment: number
  lastPayment: number
  totalInterest: number
  totalPayment: number
  /** 매매가격 - 대출금액 */
  requiredCash: number
  /** 보유 현금 - 필요 현금 (음수면 부족) */
  cashGap: number
  /** 대출금액 / 매매가격 (%) — 단순 비율이며 금융기관 심사 기준 LTV 가 아님 */
  loanRatioPct: number | null
  schedule: LoanRow[]
}

/** 단순 산식 계산. 중도상환·거치기간·금리변동·수수료·세금은 반영하지 않는다. 단위: 만원 */
export function calcLoan(input: LoanInput): LoanResult {
  const errors: string[] = []
  const { price, cash, loan, ratePct, years, method } = input
  if (!(price > 0)) errors.push('매매가격을 입력하세요.')
  if (loan < 0 || cash < 0) errors.push('금액은 0 이상이어야 합니다.')
  if (loan > price && price > 0) errors.push('대출금액이 매매가격보다 큽니다.')
  if (ratePct < 0 || ratePct > 30) errors.push('대출금리는 0~30% 범위로 입력하세요.')
  if (loan > 0 && !(years > 0 && years <= 50)) errors.push('대출기간은 1~50년 범위로 입력하세요.')

  const months = Math.round(years * 12)
  const requiredCash = Math.max(0, price - loan)
  const base: LoanResult = {
    valid: errors.length === 0,
    errors,
    months,
    firstPayment: 0,
    lastPayment: 0,
    totalInterest: 0,
    totalPayment: 0,
    requiredCash,
    cashGap: cash - requiredCash,
    loanRatioPct: price > 0 ? (loan / price) * 100 : null,
    schedule: [],
  }
  if (!base.valid || loan === 0 || months === 0) return base

  const r = ratePct / 100 / 12
  const schedule: LoanRow[] = []
  let balance = loan
  let totalInterest = 0

  if (method === 'annuity') {
    const pay = r === 0 ? loan / months : (loan * r * (1 + r) ** months) / ((1 + r) ** months - 1)
    for (let m = 1; m <= months; m++) {
      const interest = balance * r
      const principal = m === months ? balance : pay - interest
      balance -= principal
      totalInterest += interest
      schedule.push({ month: m, payment: principal + interest, principal, interest, balance: Math.max(0, balance) })
    }
  } else {
    const principal = loan / months
    for (let m = 1; m <= months; m++) {
      const interest = balance * r
      balance -= principal
      totalInterest += interest
      schedule.push({ month: m, payment: principal + interest, principal, interest, balance: Math.max(0, balance) })
    }
  }

  return {
    ...base,
    firstPayment: schedule[0].payment,
    lastPayment: schedule[schedule.length - 1].payment,
    totalInterest,
    totalPayment: loan + totalInterest,
    schedule,
  }
}
