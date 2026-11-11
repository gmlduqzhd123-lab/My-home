// 디자인 확인용 화면 캡처. 사용: node tools/shots.mjs <기준 주소> <저장 폴더>
// 예: npm run dev:fixture 를 띄운 뒤  node tools/shots.mjs http://localhost:5173 ./shots
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const [base = 'http://localhost:5173', out = './shots'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })

const SHOTS = [
  { name: 'desktop-home', route: '/', width: 1280, height: 900 },
  { name: 'desktop-trades', route: '/trades', width: 1280, height: 900, scrollTo: 'table' },
  { name: 'mobile-home', route: '/', width: 390, height: 844 },
  { name: 'mobile-trades', route: '/trades', width: 390, height: 844, scrollTo: 'ul.divide-y' },
  { name: 'desktop-home-dark', route: '/', width: 1280, height: 900, dark: true },
]

const browser = await chromium.launch()
for (const s of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, locale: 'ko-KR', deviceScaleFactor: 1 })
  await ctx.addInitScript((dark) => {
    localStorage.setItem('suncheon-zip:prefs', JSON.stringify({ state: { theme: dark ? 'dark' : 'light' }, version: 1 }))
  }, !!s.dark)
  const page = await ctx.newPage()
  await page.goto(`${base}/#${s.route}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  if (s.scrollTo) {
    await page.locator(s.scrollTo).first().evaluate((el) => {
      el.scrollIntoView({ block: 'start' })
      globalThis.scrollBy(0, -150)
    })
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: path.join(out, `${s.name}.png`) })
  await ctx.close()
  console.log(s.name)
}
await browser.close()
