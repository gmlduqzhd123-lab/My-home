/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * GitHub Pages 기준 경로.
 * 1) VITE_BASE 환경변수  2) GitHub Actions 의 GITHUB_REPOSITORY(owner/repo)  3) 상대경로('./')
 * HashRouter 를 쓰므로 상대경로만으로도 어떤 저장소 이름에서든 동작한다.
 */
function resolveBase(): string {
  const explicit = process.env.VITE_BASE
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (repo) return repo.endsWith('.github.io') ? '/' : `/${repo}/`
  return './'
}

/**
 * `npm run dev:fixture` 전용: 화면 점검을 위해 tests/fixtures/data 의 "가상 테스트 데이터"를 /data 로 제공한다.
 * 프로덕션 빌드에는 절대 포함되지 않는다(이 플러그인은 dev 서버에서만 동작).
 */
function fixtureData(): Plugin {
  const dir = path.join(root, 'tests', 'fixtures', 'data')
  return {
    name: 'suncheon-fixture-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const idx = url.indexOf('/data/')
        if (idx < 0) return next()
        const file = path.join(dir, decodeURIComponent(url.slice(idx + '/data/'.length)))
        if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404
          return res.end('not found')
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(fs.readFileSync(file))
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  base: resolveBase(),
  resolve: { alias: { '@': path.join(root, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'fixture' ? [fixtureData()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'ys-install.js', 'ys-qr.js', 'qr.svg'],
      manifest: {
        // 같은 주소(github.io)의 다른 엽쌤 앱과 구별되는 고유 이름표
        id: '/My-home/',
        name: '순천집 ZIP — 순천 부동산의 모든 것',
        short_name: '순천집 ZIP',
        description: '순천의 모든 집, 모든 가격, 모든 변화를 한눈에.',
        lang: 'ko',
        theme_color: '#ffffff',
        background_color: '#F3F5F7',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            // 데이터 JSON 은 항상 네트워크 우선(최신 갱신 반영), 오프라인일 때만 캐시 사용
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'suncheon-data', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}))
