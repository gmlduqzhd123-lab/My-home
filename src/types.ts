/** public/data 의 JSON 스키마. scripts/collector 가 생성하는 구조와 1:1 로 대응한다. */

export type SourceStatus = 'connected' | 'pending' | 'failed'

export interface DataSource {
  id: string
  name: string
  provider: string
  url: string
  status: SourceStatus
  note?: string
}

export interface ManifestMonth {
  ym: string // YYYY-MM (계약월)
  count: number // 해제 제외 거래 건수
  cancelled: number // 해제 거래 건수
  fetchedAt: string // 이 달 자료를 마지막으로 정상 조회한 시각
}

export interface Manifest {
  schemaVersion: number
  /** ok: 정상 데이터 있음 / pending: 한 번도 수집되지 않음(연결 대기) */
  status: 'ok' | 'pending'
  /** 화면 점검용 가상 데이터 여부(운영 데이터에는 존재하지 않음) */
  fixture?: boolean
  region: { name: string; lawdCd: string }
  /** 마지막으로 "정상 완료"된 갱신 시각 */
  generatedAt: string | null
  lastAttemptAt: string | null
  lastAttemptStatus: 'ok' | 'partial' | 'failed' | null
  lastAttemptMessage: string | null
  months: ManifestMonth[]
  /** 전월세가 수집된 달(해제 개념 없음) */
  rentMonths?: { ym: string; count: number; fetchedAt: string }[]
  rentMessage?: string | null
  /** 마지막 실행에서 법정동 시군구코드별로 받은 매매 건수 */
  lawdCounts?: Record<string, number>
  totals: { trades: number; cancelled: number; complexes: number; geocoded: number; rents?: number }
  sources: DataSource[]
}

export interface Trade {
  id: string
  complexId: string
  aptNm: string
  umdNm: string
  jibun: string | null
  roadNm: string | null
  dealDate: string // YYYY-MM-DD (계약일)
  price: number // 만원
  area: number // 전용면적 ㎡
  floor: number | null
  buildYear: number | null
  dealType: string | null // 중개거래 / 직거래
  cancelled: boolean
  cancelDate: string | null
  rgstDate: string | null
  aptDong: string | null
  buyer: string | null
  seller: string | null
  agentLoc: string | null
  landLease: boolean | null
  firstSeenAt: string // 수집기가 이 거래를 처음 확인한 시각
  /** 최근 조회에서 더 이상 확인되지 않은 시각(정정 등). 해제와는 다르며 통계에서 제외한다. */
  missingSince?: string | null
}

/** 전월세 실거래. monthly 가 0 이면 전세 */
export interface Rent {
  id: string
  complexId: string
  aptNm: string
  umdNm: string
  jibun: string | null
  dealDate: string
  deposit: number // 보증금(만원)
  monthly: number // 월세(만원)
  area: number
  floor: number | null
  buildYear: number | null
  contractType: string | null // 신규 / 갱신
  contractTerm: string | null
  useRenewal: boolean | null // 갱신요구권 사용 여부
  prevDeposit: number | null
  prevMonthly: number | null
  firstSeenAt: string
  missingSince?: string | null
}

export interface RentMonthFile {
  ym: string
  fetchedAt: string
  source: string
  rents: Rent[]
}

export interface ComplexRentFile {
  complexId: string
  generatedAt: string
  source: string
  rents: Rent[]
}

export interface MonthFile {
  ym: string
  fetchedAt: string
  source: string
  trades: Trade[]
}

export interface ComplexFile {
  complexId: string
  generatedAt: string
  source: string
  trades: Trade[]
}

export interface KaptInfo {
  kaptCode: string
  households: number | null
  dongCount: number | null
  topFloor: number | null
  useDate: string | null
  heating: string | null
  hallType: string | null
  builder: string | null
  parkingTotal: number | null
  welfare: string | null
  convenient: string | null
  education: string | null
  busTime: string | null
  fetchedAt: string
}

export interface Complex {
  id: string
  name: string
  umdNm: string
  jibun: string | null
  roadAddress: string | null
  address: string
  buildYear: number | null
  lat: number | null
  lng: number | null
  coordSource: string | null
  areas: number[] // 거래에 나타난 전용면적 그룹(반올림 ㎡)
  tradeCount: number // 수집 기간 내 해제 제외 거래
  cancelledCount: number
  lastDealDate: string | null
  lastPrice: number | null
  lastArea: number | null
  lastFloor: number | null
  /** 수집 기간 내 전월세 거래 수(전월세 미연결이면 없음) */
  rentCount?: number
  kapt: KaptInfo | null
}

export interface ComplexesFile {
  generatedAt: string
  complexes: Complex[]
}

export interface MonthStat {
  ym: string
  count: number
  cancelled: number
  median: number | null
}

export interface DongStat {
  umdNm: string
  count: number
  median: number | null
}

export interface SummaryFile {
  generatedAt: string
  months: MonthStat[]
  /** 최근 12개월(계약월 기준) 법정동별 집계 */
  byDong: { fromYm: string; toYm: string; rows: DongStat[] }
  /** 계약일 최신순 */
  recentTrades: Trade[]
}

export type BriefingStatus = 'ok' | 'no_new' | 'failed' | 'initial' | 'pending'

export interface Briefing {
  date: string // 데이터 확인 기준일 (KST, YYYY-MM-DD)
  generatedAt: string
  status: BriefingStatus
  message: string | null
  previousDate: string | null
  headlines: string[]
  newTrades: Trade[]
  newTradesTotal: number
  newCancellations: Trade[]
  corrections: { id: string; aptNm: string; field: string; before: string; after: string }[]
  zones: { zoneId: string; name: string; newCount: number; median: number | null }[]
  presales: PresaleItem[]
  checklist: string[]
  sources: { name: string; url: string }[]
}

export interface BriefingIndex {
  items: { date: string; status: BriefingStatus; newTradesTotal: number }[]
}

export interface PresaleItem {
  id: string
  name: string
  location: string
  households: number | null
  announceDate: string | null
  receiptStart: string | null
  receiptEnd: string | null
  winnerDate: string | null
  contractStart: string | null
  contractEnd: string | null
  moveInMonth: string | null
  url: string | null
  /** 주택형별 최고 분양가(만원). 공고에 없으면 빈 배열 */
  prices: { type: string; price: number; supplyArea?: string | null; households?: number }[]
}

export interface PresalesFile {
  status: 'ok' | 'pending' | 'failed'
  fetchedAt: string | null
  message: string | null
  source: { name: string; url: string }
  items: PresaleItem[]
}

/** 한국부동산원 (월) 아파트 매매가격지수 — 순천시 */
export interface PriceIndexFile {
  status: 'ok' | 'pending' | 'failed'
  fetchedAt: string | null
  message: string | null
  region: string
  source: { name: string; url: string }
  items: { ym: string; value: number }[]
}

export interface DevelopmentsFile {
  status: 'ok' | 'pending' | 'failed'
  fetchedAt: string | null
  message: string | null
  items: { id: string; title: string; date: string; url: string; source: string }[]
}

export interface SchoolsFile {
  status: 'ok' | 'pending' | 'failed'
  fetchedAt: string | null
  message: string | null
  source: { name: string; url: string }
  items: { id: string; name: string; kind: string; address: string; lat: number | null; lng: number | null }[]
}
