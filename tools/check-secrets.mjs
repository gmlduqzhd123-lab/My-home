// API 키 노출 점검.
// 1) 환경변수에 있는 비밀 값(공공데이터 키, Kakao REST 키)이 빌드 산출물·공개 데이터에 들어가지 않았는지
// 2) 소스·데이터에 키처럼 보이는 문자열(serviceKey=값, KakaoAK 값)이 하드코딩되지 않았는지
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SECRET_ENVS = ['MOLIT_API_KEY', 'RENT_API_KEY', 'KAPT_API_KEY', 'APPLYHOME_API_KEY', 'SCHOOL_API_KEY', 'LH_API_KEY', 'REB_API_KEY', 'KAKAO_REST_API_KEY']
const SCAN_DIRS = ['dist', 'public', 'src', 'scripts', 'tools', '.github', 'data-cache']
const SKIP = new Set(['node_modules', '__pycache__', '.git'])
const TEXT = /\.(js|mjs|ts|tsx|json|html|css|py|yml|yaml|md|txt|svg|webmanifest|map)$/i

const secrets = SECRET_ENVS.map((k) => (process.env[k] ?? '').trim()).filter((v) => v.length >= 8)
const variants = secrets.flatMap((s) => {
  const dec = s.includes('%') ? decodeURIComponent(s) : s
  return [...new Set([s, dec, encodeURIComponent(dec)])]
})
const PATTERNS = [
  { re: /serviceKey=[A-Za-z0-9%+/=]{20,}/i, name: 'serviceKey 값 하드코딩' },
  { re: /KakaoAK\s+[0-9a-f]{32}/i, name: 'Kakao REST 키 하드코딩' },
]

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (TEXT.test(e.name)) yield p
  }
}

const problems = []
let files = 0
for (const d of SCAN_DIRS) {
  const dir = path.join(ROOT, d)
  if (!fs.existsSync(dir)) continue
  for (const file of walk(dir)) {
    files += 1
    const text = fs.readFileSync(file, 'utf8')
    const rel = path.relative(ROOT, file)
    for (const v of variants) if (text.includes(v)) problems.push(`${rel}: 환경변수의 비밀 키 값이 포함됨`)
    for (const p of PATTERNS) if (p.re.test(text)) problems.push(`${rel}: ${p.name}`)
  }
}
for (const f of ['.env', '.env.local']) {
  if (!fs.existsSync(path.join(ROOT, f))) continue
  const ignore = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : ''
  if (!/^\.env(\.\*)?$/m.test(ignore)) problems.push(`${f} 가 .gitignore 에 없습니다`)
}

if (problems.length) {
  console.error(`API 키 노출 점검 실패 (${problems.length}건)`)
  for (const p of [...new Set(problems)]) console.error(` - ${p}`)
  process.exit(1)
}
console.log(`API 키 노출 점검 통과: 파일 ${files}개, 대조한 비밀 값 ${secrets.length}개`)
