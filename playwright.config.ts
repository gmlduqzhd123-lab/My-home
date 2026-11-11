import { defineConfig, devices } from '@playwright/test'

const PORT = 5199

/**
 * 브라우저 E2E 테스트. 가상 테스트 데이터(tests/fixtures)를 새로 만들어 dev 서버로 띄운 뒤 검사한다.
 * 실행: npm run test:e2e  (처음 한 번은 npx playwright install chromium 필요)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  // dev 서버가 처음 의존성을 묶는 동안 첫 화면이 늦게 뜰 수 있다
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 2 : 4,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `python scripts/make_fixture.py && npx vite --mode fixture --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
