import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { reloadOnce } from './components/ErrorBoundary'
import './index.css'

// 새 버전 배포 뒤 이전 버전의 코드 조각을 불러오지 못하면 한 번 새로고침해 최신 버전을 받는다
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
