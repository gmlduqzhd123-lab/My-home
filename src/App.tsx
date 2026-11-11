import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingBlock, NotAvailable } from '@/components/ui/states'

const HomePage = lazy(() => import('@/pages/HomePage'))
const MapPage = lazy(() => import('@/pages/MapPage'))
const TradesPage = lazy(() => import('@/pages/TradesPage'))
const ComplexPage = lazy(() => import('@/pages/ComplexPage'))
const ComparePage = lazy(() => import('@/pages/ComparePage'))
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage'))
const BriefingPage = lazy(() => import('@/pages/BriefingPage'))
const PresalesPage = lazy(() => import('@/pages/PresalesPage'))
const LivingPage = lazy(() => import('@/pages/LivingPage'))
const CalculatorPage = lazy(() => import('@/pages/CalculatorPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingBlock rows={6} />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/complex/:id" element={<ComplexPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/briefing" element={<BriefingPage />} />
          <Route path="/briefing/:date" element={<BriefingPage />} />
          <Route path="/presales" element={<PresalesPage />} />
          <Route path="/living" element={<LivingPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotAvailable title="페이지를 찾을 수 없습니다">주소를 다시 확인해 주세요.</NotAvailable>} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
