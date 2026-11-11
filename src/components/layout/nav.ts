import {
  BarChart3,
  Building2,
  Calculator,
  Database,
  GitCompareArrows,
  Heart,
  Home,
  KeyRound,
  Map,
  Newspaper,
  School,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Phase 2: 데이터 연계가 완료되지 않은 메뉴 */
  beta?: boolean
}

export const SIDE_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: Home },
  { to: '/map', label: '지도', icon: Map },
  { to: '/trades', label: '실거래', icon: BarChart3 },
  { to: '/rents', label: '전월세', icon: KeyRound },
  { to: '/compare', label: '비교', icon: GitCompareArrows },
  { to: '/favorites', label: '관심 단지', icon: Heart },
  { to: '/briefing', label: '브리핑', icon: Newspaper },
  { to: '/presales', label: '분양', icon: Building2, beta: true },
  { to: '/living', label: '생활환경', icon: School, beta: true },
  { to: '/calculator', label: '계산기', icon: Calculator },
  { to: '/about', label: '데이터 출처', icon: Database },
]

export const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: '홈', icon: Home },
  { to: '/map', label: '지도', icon: Map },
  { to: '/trades', label: '실거래', icon: BarChart3 },
  { to: '/compare', label: '비교', icon: GitCompareArrows },
  { to: '/favorites', label: '관심', icon: Heart },
]
