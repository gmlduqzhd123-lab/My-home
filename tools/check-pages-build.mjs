// GitHub Pages 경로 검증: dist/index.html 이 참조하는 자산이 실제로 있고, base 경로가 일관되며,
// 가상 테스트 데이터가 빌드에 섞이지 않았는지 확인한다.
import fs from 'node:fs'
import path from 'node:path'

const dist = path.join(process.cwd(), 'dist')
const fail = (m) => {
  console.error(`Pages 빌드 검증 실패: ${m}`)
  process.exit(1)
}
if (!fs.existsSync(path.join(dist, 'index.html'))) fail('dist/index.html 이 없습니다. 먼저 npm run build 를 실행하세요.')

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#|mailto:)/.test(u))
if (refs.length === 0) fail('index.html 에 자산 참조가 없습니다.')

// 기대 base: VITE_BASE → GITHUB_REPOSITORY → './'
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const expected = process.env.VITE_BASE
  ? process.env.VITE_BASE.replace(/\/?$/, '/')
  : repo
    ? repo.endsWith('.github.io') ? '/' : `/${repo}/`
    : './'

for (const u of refs) {
  let rel
  if (expected === './') {
    if (u.startsWith('/')) fail(`상대 경로 빌드인데 절대 경로 참조가 있습니다: ${u}`)
    rel = u.replace(/^\.\//, '')
  } else if (u.startsWith('/')) {
    if (!u.startsWith(expected)) fail(`base(${expected})로 시작하지 않는 절대 경로 참조: ${u}`)
    rel = u.slice(expected.length)
  } else {
    rel = u.replace(/^\.\//, '') // 상대 경로는 index.html 위치 기준이라 어떤 base 에서도 유효
  }
  if (!fs.existsSync(path.join(dist, rel.split('?')[0]))) fail(`참조된 파일이 없습니다: ${u}`)
}

for (const f of ['data/manifest.json', 'manifest.webmanifest', 'sw.js', 'favicon.svg']) {
  if (!fs.existsSync(path.join(dist, f))) fail(`${f} 이(가) 빌드에 없습니다.`)
}
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'manifest.json'), 'utf8'))
if (manifest.fixture) fail('가상 테스트 데이터(manifest.fixture)가 빌드에 포함되었습니다.')
if (fs.existsSync(path.join(dist, 'data', 'complexes.json'))) {
  const c = fs.readFileSync(path.join(dist, 'data', 'complexes.json'), 'utf8')
  if (c.includes('[가상]')) fail('가상 단지명이 운영 데이터에 포함되었습니다.')
}

console.log(`Pages 빌드 검증 통과: base=${expected}, 자산 참조 ${refs.length}개, 데이터 상태=${manifest.status}`)
