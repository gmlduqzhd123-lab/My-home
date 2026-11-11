import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** 모든 테스트 공통: 콘솔 오류·처리되지 않은 예외가 없어야 한다 */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

const ROUTES = ['/', '/trades', '/rents', '/map', '/compare', '/favorites', '/briefing', '/presales', '/living', '/calculator', '/about']

test.describe('핵심 사용 흐름', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 레이아웃 기준 흐름')

  test('검색 → 단지 상세 → 관심·비교 → 실거래 필터 → 브리핑 → 출처', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await expect(page.getByText('화면 점검용 가상 테스트 데이터입니다')).toBeVisible()
    await expect(page.getByText('최근 12개월 거래량')).toBeVisible()
    await expect(page.getByText(/최종 갱신 \d{4}\.\d{2}\.\d{2}/)).toBeVisible()

    // 1) 상단 검색으로 단지 찾기
    await page.getByRole('combobox', { name: '아파트 단지 검색' }).fill('왕지하늘')
    await page.getByRole('option').first().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('왕지하늘채')
    await expect(page.getByText('거래금액 추이')).toBeVisible()
    await expect(page.locator('figure svg.recharts-surface').first()).toBeVisible()
    await expect(page.getByRole('table', { name: '아파트 매매 실거래 목록' })).toBeVisible()
    await expect(page.getByRole('table', { name: '아파트 전월세 실거래 목록' })).toBeVisible()

    // 2) 관심 단지 저장 + 비교 담기
    await page.getByRole('button', { name: /왕지하늘채 관심 단지 추가/ }).click()
    await page.getByRole('button', { name: /왕지하늘채 비교에 담기/ }).click()

    // 3) 비교: 단지 하나 더 추가
    await page.getByRole('link', { name: '비교', exact: true }).first().click()
    await page.getByLabel(/비교할 단지 검색/).fill('조례')
    await page.getByRole('button', { name: /조례한빛/ }).click()
    const compare = page.getByRole('table', { name: '단지 비교 표' })
    await expect(compare.getByRole('columnheader')).toHaveCount(3)
    await expect(page.getByText('비교 조건 주의')).toBeVisible()

    // 4) 실거래: 필터 → 주소에 저장 → 새로고침 후 복원
    await page.getByRole('link', { name: '실거래', exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('아파트 실거래가')
    await page.getByLabel('단지명', { exact: true }).fill('신대')
    await page.getByLabel('직거래 제외').check()
    await expect(page).toHaveURL(/q=%EC%8B%A0%EB%8C%80/)
    await expect(page).toHaveURL(/direct=0/)
    const rows = page.getByRole('table', { name: '아파트 매매 실거래 목록' }).locator('tbody tr')
    await expect(rows.first()).toContainText('신대')
    await page.reload()
    await expect(page.getByLabel('단지명', { exact: true })).toHaveValue('신대')
    await expect(page.getByLabel('직거래 제외')).toBeChecked()
    await expect(rows.first()).toContainText('신대')

    // 5) 관심 단지는 새로고침 뒤에도 남는다
    await page.goto('/#/favorites')
    await expect(page.getByText('관심 단지 1곳')).toBeVisible()

    // 6) 전월세 · 브리핑 · 출처
    await page.goto('/#/rents')
    await expect(page.getByRole('table', { name: '아파트 전월세 실거래 목록' })).toBeVisible()
    await page.goto('/#/briefing')
    await expect(page.getByText('오늘의 핵심 3줄')).toBeVisible()
    await expect(page.getByText(/새로 확인된 매매 거래는 \d+건입니다/)).toBeVisible()
    await page.goto('/#/about')
    await expect(page.getByText('마지막 정상 갱신')).toBeVisible()
    await expect(page.getByText('국토교통부 아파트 매매 실거래가 상세 자료').first()).toBeVisible()

    expect(errors).toEqual([])
  })

  test('지도 키가 없어도 단지 목록으로 탐색할 수 있다', async ({ page }) => {
    await page.goto('/#/map')
    await expect(page.getByText('지도 연결 대기 중').filter({ visible: true }).first()).toBeVisible()
    await page.getByLabel('단지 검색', { exact: true }).filter({ visible: true }).fill('연향')
    await page.getByRole('button', { name: /연향새솔/ }).filter({ visible: true }).click()
    await expect(page.getByRole('region', { name: /연향새솔 요약/ }).filter({ visible: true })).toBeVisible()
    await page.getByRole('link', { name: '상세 보기' }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('연향새솔')
  })

  test('거래가 없는 단지(K-apt 목록)도 찾아볼 수 있다', async ({ page }) => {
    await page.goto('/#/map')
    await page.getByLabel('단지 검색', { exact: true }).filter({ visible: true }).fill('매곡고요')
    await page.getByRole('button', { name: /매곡고요/ }).filter({ visible: true }).click()
    await page.getByRole('link', { name: '상세 보기' }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('매곡고요')
    await expect(page.getByText('180세대')).toBeVisible()
    await expect(page.getByText('거래가 없습니다').first()).toBeVisible()
  })
})

test.describe('화면별 점검', () => {
  for (const route of ROUTES) {
    test(`${route} — 오류 없음 · 가로 넘침 없음 · 접근성`, async ({ page }) => {
      const errors = watchErrors(page)
      await page.goto(`/#${route}`)
      await expect(page.locator('main')).not.toBeEmpty()
      await expect(page.locator('[role="status"][aria-label="불러오는 중"]')).toHaveCount(0)

      // 가로 스크롤이 생기면 안 된다(모바일 포함)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, '가로 넘침(px)').toBeLessThanOrEqual(0)

      // 접근성: 심각도 serious 이상 위반이 없어야 한다 (차트 SVG 내부는 텍스트 요약으로 대체하므로 제외)
      const axe = await new AxeBuilder({ page }).exclude('.recharts-wrapper').analyze()
      const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}곳 — ${v.nodes[0]?.html.slice(0, 110)}`)).toEqual([])

      expect(errors).toEqual([])
    })
  }
})

test('모바일: 하단 메뉴로 이동한다', async ({ page, isMobile }) => {
  test.skip(!isMobile, '모바일 전용')
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '하단 메뉴' })
  await expect(nav).toBeVisible()
  await nav.getByRole('link', { name: '실거래' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('아파트 실거래가')
  await nav.getByRole('link', { name: '관심' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('관심 아파트')
  // 전체 메뉴 서랍에서 하단에 없는 메뉴로 이동
  await page.getByRole('button', { name: '전체 메뉴 열기' }).click()
  await page.getByRole('dialog', { name: '전체 메뉴' }).getByRole('link', { name: '전월세' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('아파트 전월세 실거래')
})
