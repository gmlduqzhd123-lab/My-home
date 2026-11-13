# 순천집 ZIP — 순천 부동산의 모든 것

> 순천의 모든 집, 모든 가격, 모든 변화를 한눈에.

국토교통부 실거래가 공개 자료를 매일 수집해 순천시 아파트 매매 거래를 검색·비교하는 정적 웹앱입니다.
서버·회원가입 없이 GitHub Pages 만으로 동작합니다.

- 프런트엔드: React + TypeScript + Vite, Tailwind CSS, shadcn/ui 방식 컴포넌트, Recharts, Zustand, HashRouter, PWA
- 데이터: Python(표준 라이브러리만 사용) 수집기 → `public/data/*.json`
- 자동화·배포: GitHub Actions → GitHub Pages

> **현재 상태** — https://gmlduqzhd123-lab.github.io/My-home/ 에 배포되어 있으며, 실제 매매 실거래가 매일 수집됩니다.
> 전월세·단지 기본정보·분양·학교·가격지수·지도는 코드가 준비되어 있고, 아래 2단계의 활용신청·키 등록을 하면 다음 수집부터 표시됩니다.
> 각 자료의 연결 상태는 사이트의 "데이터 출처" 화면에서 확인할 수 있습니다.

---

## 1. 내 컴퓨터에서 실행하기

필요한 프로그램: [Node.js](https://nodejs.org/) 22 이상, [Python](https://www.python.org/) 3.10 이상, Git.

```bash
npm install
```

```bash
npm run dev
```

브라우저에서 터미널에 표시된 주소(보통 http://localhost:5173)를 엽니다.

### 화면만 먼저 둘러보고 싶을 때 (가상 테스트 데이터)

```bash
python scripts/make_fixture.py
```

```bash
npm run dev:fixture
```

단지명이 모두 `[가상]`으로 시작하는 **가짜 데이터**가 표시되고 화면 위에 빨간 경고 띠가 나옵니다.
이 데이터는 `tests/fixtures/` 에만 있으며 운영 데이터(`public/data`)와 배포 빌드에는 들어가지 않습니다(빌드 검증 스크립트가 확인).

## 2. 인증키 발급

| 키 | 용도 | 필수 | 발급 방법 |
|---|---|---|---|
| `MOLIT_API_KEY` | 아파트 매매 실거래 조회 | **필수** | [공공데이터포털](https://www.data.go.kr) 가입 → [국토교통부_아파트 매매 실거래가 상세 자료](https://www.data.go.kr/data/15126468/openapi.do) "활용신청" → 마이페이지에서 일반 인증키 복사 |
| (같은 키) | 전월세 실거래 | 선택 | 같은 계정으로 [국토교통부_아파트 전월세 실거래가 자료](https://www.data.go.kr/data/15126474/openapi.do) 활용신청 |
| (같은 키) | 단지 세대수·난방 등 기본정보, 거래 없는 단지까지 포함한 전체 단지 목록 | 선택 | 같은 계정으로 [공동주택 단지 목록](https://www.data.go.kr/data/15057332/openapi.do), [공동주택 기본 정보](https://www.data.go.kr/data/15058453/openapi.do) 활용신청 |
| (같은 키) | 학교 목록·가까운 학교 | 선택 | 같은 계정으로 [전국초중등학교위치표준데이터](https://www.data.go.kr/data/15021148/standard.do) 활용신청 |
| (같은 키) | 주택 인허가 현황(향후 공급 가능 단지) | 선택 | 같은 계정으로 [건축HUB_주택인허가정보 서비스](https://www.data.go.kr/data/15136560/openapi.do) 활용신청 |
| (같은 키) | 건축물대장(세대수·주차·건폐율·용적률) | 선택 | 같은 계정으로 [건축물대장정보 서비스](https://www.data.go.kr/data/15134735/openapi.do) 활용신청 |
| `MOLIT_STAT_API_KEY` | 순천시 미분양 통계 | 선택 | [국토교통 통계누리](https://stat.molit.go.kr/portal/api/info.do)에서 Open API 키 신청(미분양주택현황 통계표) |
| `KOSIS_API_KEY` | 순천시 주민등록 인구 | 선택 | [KOSIS 공유서비스](https://kosis.kr/openapi/devGuide/devGuide_0201List.do)에서 키 발급 |
| `REB_API_KEY` | 순천시 아파트 매매가격지수 | 선택 | [한국부동산원 R-ONE](https://www.reb.or.kr/r-one/portal/openapi/openApiDevPage.do) 로그인 후 Open API 인증키 발급(공공데이터포털 키와 다름) |
| (같은 키) | 순천 LH 분양·임대 공고 | 선택 | 같은 계정으로 [한국토지주택공사_분양임대공고문 조회 서비스](https://www.data.go.kr/data/15058530/openapi.do) 활용신청 |
| (같은 키) | 분양 공고·주택형별 분양가 | 선택 | 같은 계정으로 [청약홈 분양정보 조회 서비스](https://www.data.go.kr/data/15098547/openapi.do) 활용신청 |

- 공공데이터포털 키는 계정당 하나이며 활용신청한 서비스에만 동작합니다. 신청 직후에는 반영까지 시간이 걸릴 수 있습니다.
- 지도 화면(배경지도)과 단지 주변 시설은 [OpenStreetMap](https://www.openstreetmap.org/copyright) 을 쓰므로 **키가 필요 없습니다**. 주변 시설은 브라우저가 Overpass API 에 직접 조회합니다.
- 단지 좌표는 수집할 때 OpenStreetMap [Nominatim](https://nominatim.org/) 에서 **단지명**으로 찾습니다(키 불필요). 이용 정책에 맞춰 초당 1회, 한 번 수집에 최대 400회만 조회하고 결과를 `data-cache/geocode.json` 에 저장해 다시 쓰므로, 처음에는 며칠에 걸쳐 채워집니다.
- 브이월드 지오코더는 해외 서버(GitHub Actions)에서 접속이 막혀(HTTP 502) 쓰지 않습니다.
- 선택 키가 없어도 실거래 검색·차트·비교·관심·브리핑은 모두 동작합니다.

## 3. 내 컴퓨터에서 데이터 수집해 보기

`.env.example` 을 `.env` 로 복사하고 키를 채운 뒤:

```bash
python scripts/collect.py
```

- 첫 실행은 최근 24개월, 이후 실행은 최근 12개월을 다시 조회해 신고 지연·해제·정정을 반영합니다(`--months N` 으로 변경).
- 더 오래된 기간을 채우려면 `python scripts/collect.py --months 60` 처럼 한 번 실행하면 됩니다. 이미 수집된 달은 지워지지 않고 계속 쌓입니다.
  GitHub 에서는 Actions → "데이터 수집 · 배포" → Run workflow 의 "재조회할 개월 수"에 숫자를 넣습니다.
- 결과는 `public/data/` 에 생성됩니다. 좌표·K-apt 조회 결과는 `data-cache/` 에 저장해 재사용합니다.
- 조회에 실패하면 기존 데이터 파일은 건드리지 않고 `manifest.json` 에 실패 사실만 기록합니다(종료 코드 3).

## 4. GitHub Pages 로 배포하기

1. GitHub 에 새 저장소를 만들고 이 폴더를 올립니다.

   ```bash
   git remote add origin https://github.com/<계정>/<저장소>.git
   ```

   ```bash
   git push -u origin main
   ```

2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. **Settings → Secrets and variables → Actions → New repository secret** 으로 키를 등록합니다.
   `MOLIT_API_KEY`(필수), `REB_API_KEY`, `MOLIT_STAT_API_KEY`, `KOSIS_API_KEY`(선택).
   공공데이터포털 서비스들은 같은 계정이면 키가 같으므로 `MOLIT_API_KEY` 하나로 충분합니다
   (다른 계정의 키를 쓰려면 `RENT_API_KEY`, `KAPT_API_KEY`, `APPLYHOME_API_KEY`, `SCHOOL_API_KEY` 를 따로 등록).
4. **Actions → "데이터 수집 · 배포" → Run workflow** 를 눌러 첫 수집을 실행합니다.
5. 완료되면 `https://<계정>.github.io/<저장소>/` 에서 접속할 수 있습니다.

이후에는 매일 한국시간 오전 7시 30분에 자동으로 수집·배포됩니다(GitHub 예약 실행은 수십 분 늦어질 수 있어 8시 이전 완료를 목표로 앞당겼습니다. 실제 완료 시각은 화면의 "데이터 기준"에 표시됩니다).

- 기준 경로(`base`)는 저장소 이름으로 자동 설정됩니다. 직접 지정하려면 `VITE_BASE` 를 사용하세요.
- 수집이 실패한 날에도 마지막 정상 데이터로 사이트는 배포됩니다. 워크플로는 실패로 표시되고 저장소에 "공공데이터 수집 실패" 이슈가 생성(이미 열려 있으면 댓글 추가)됩니다. 화면에는 "최근 조회 실패" 띠가 나타납니다.
- 예약 실행은 저장소에 60일간 활동이 없으면 GitHub 이 자동으로 멈춥니다. 수집 커밋이 매일 생기므로 보통은 유지됩니다.

## 5. 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run dev:fixture` | 가상 테스트 데이터로 개발 서버 |
| `npm run build` | 타입 검사 + 프로덕션 빌드(`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run typecheck` / `npm run lint` | TypeScript 검사 / ESLint |
| `npm run test` | 프런트엔드 테스트(Vitest) |
| `npm run test:py` | 수집기 테스트(unittest) |
| `npm run test:e2e` | 브라우저 E2E·접근성 테스트(Playwright). 처음 한 번 `npx playwright install chromium` 필요 |
| `npm run check:pages` | GitHub Pages 경로·빌드 검증 |
| `npm run check:secrets` | API 키 노출 점검 |
| `npm run verify` | 위 검사를 모두 실행 |
| `python scripts/collect.py` | 공공데이터 수집 |

## 6. 데이터 구조 (`public/data`)

| 파일 | 내용 |
|---|---|
| `manifest.json` | 상태, 마지막 정상 갱신 시각(`generatedAt`), 마지막 시도 결과, 수집된 달 목록, 출처별 연결 상태 |
| `trades/YYYY-MM.json` | 계약월별 거래(출처·조회 시각 포함). 화면은 필요한 달만 내려받습니다 |
| `by-complex/<단지ID>.json` | 단지별 전체 매매 거래(단지 상세·비교용) |
| `rents/YYYY-MM.json`, `by-complex-rent/<단지ID>.json` | 계약월별·단지별 전월세 거래 |
| `stats/price-index.json` | 한국부동산원 (월) 아파트 매매가격지수 — 순천시 |
| `stats/unsold.json`, `stats/population.json` | 순천시 미분양 호수, 주민등록 인구(월별) |
| `supply.json` | 순천시 주택 인허가 사업(최근 6년, 20세대 이상) |
| `alerts.json` | 청약 알림 목록(청약홈 분양 + LH 공고, 공고별 최초 확인 시각, 이번 수집의 새 공고) |
| `presales.ics` | 청약 일정 캘린더(iCalendar) — 캘린더 앱에서 구독 |
| `schools.json` | 순천시 초·중·고 위치 |
| `complexes.json` | 단지 목록(주소, 준공연도, 좌표, 최근 거래, K-apt 기본정보) |
| `stats/summary.json` | 월별 거래량·중위가, 법정동별 집계, 최근 거래 |
| `briefing/latest.json`, `briefing/archive/YYYY-MM-DD.json`, `briefing/index.json` | 일별 브리핑 |
| `presales.json` | 청약홈 분양 공고 |
| `developments.json` | 순천 LH 분양·임대 공고(공고명에 '순천' 포함, 최근 2년) |

수집 파이프라인: API 호출 → 응답 검증 → 정규화 → 중복 제거 → 해제·정정 확인 → 통계 → 스테이징에 JSON 생성 → 스키마 검증 → 반영.
검증에 실패하면 운영 파일을 덮어쓰지 않습니다.

### 데이터 처리 원칙

- **해제 거래**는 목록에 구분 표시하고 통계에서 뺍니다.
- 이전에 있던 거래가 새 조회에서 **사라져도 삭제하거나 해제로 간주하지 않습니다.** "최근 조회 미확인"으로 표시하고 통계에서만 뺍니다(정정되면 새 거래로 다시 나타납니다).
- 한 달의 조회 건수가 기존의 절반 아래로 떨어지면 비정상 응답으로 보고 그 달은 기존 자료를 유지합니다.
- 단지는 행정코드가 아니라 `법정동명 + 지번 + 단지명`으로 식별합니다(2026-07-01 전남광주통합특별시 출범으로 시군구코드가 46150 → 12150 으로 바뀌었기 때문). 실제 수집에서 새 코드 12150 이 통합 이전 계약분까지 모두 제공하고 46150 은 0건인 것을 확인해, 기본값은 12150 만 조회합니다.
- 좌표는 OpenStreetMap 에서 단지명으로 찾은 결과가 **아파트·주거지이고 그 단지 법정동 중심에서 2.5km 안**일 때만 기록합니다. OSM 에 없거나 이름이 크게 다른 단지는 `null` 이며 지도에 표시하지 않습니다(30일마다 다시 찾음).

## 청약 알림

서버와 회원가입이 없어 앱이 닫혀 있는 방문자에게 푸시를 보낼 수는 없습니다. 대신 세 가지 경로로 알립니다.

| 경로 | 동작 | 사이트를 닫아도 알림이 오는가 |
|---|---|---|
| 캘린더 구독 | `data/presales.ics` 를 캘린더 앱에서 구독하면 청약 접수·당첨자 발표·공고 마감 일정이 들어가고, 전날 오전 9시에 캘린더 앱이 알림 | 예 (갱신 주기는 캘린더 앱에 따름) |
| 앱 안 알림 | 마지막 확인 이후 새로 수집된 공고를 상단 종 배지와 "청약 알림" 화면에 표시. 브라우저 알림을 켜면 사이트를 열 때 알림 | 아니오 |
| 메일(GitHub) | 새 공고가 수집되면 워크플로가 저장소에 "새 청약 공고 N건" 이슈를 생성. 저장소를 Watch(사용자 지정 → Issues)하면 GitHub 가 메일 발송 | 예 (GitHub 계정 필요) |

- 공고 자료는 청약홈 분양정보와 LH 분양임대 공고에서 옵니다. 두 서비스의 활용신청이 되어 있어야 공고가 수집됩니다.
- 첫 수집 때는 이미 있던 공고를 한꺼번에 새 공고로 알리지 않습니다. 그다음 수집부터 새로 나타난 공고만 알립니다.
- 조회에 실패한 날에는 이전에 확인된 공고를 그대로 유지합니다(실패를 공고 삭제로 보지 않음).
- LH 공고는 목록 자료에 접수 시작일이 없어 마감일만 일정으로 넣습니다.

## 7. 알려진 제한 · 미검증 사항

- **전월세, K-apt 기본정보·전체 단지 목록, 분양가, 학교 위치는 가상 응답으로만 테스트했습니다.** 해당 서비스의 활용신청 후 첫 수집에서 실제 응답과 맞는지 확인이 필요합니다. 가격지수 파서는 한국부동산원의 실제 응답(키 없는 표본 5행)으로 확인했습니다.
- 매매 실거래 조회는 2026-11-11 첫 수집에서 실제 응답으로 확인했습니다. 행정통합(2026-07) 전후 24개월이 모두 수집되었고, 단지 170곳 중 134곳이 전후 양쪽에 거래가 이어져 있으며, 읍·면 법정동은 `해룡면 신대리` 형태로 제공됩니다. 60개월 수집에서 12150 코드가 16,816건, 46150 코드가 0건을 돌려주는 것도 확인했습니다.
- **K-apt 기본정보와 청약홈 분양정보는 첫 수집에서 조회에 실패했습니다**(해당 서비스 활용신청이 필요한 것으로 보입니다). 연동 코드는 실제 응답으로 검증되지 않았습니다.
- 지도는 OpenStreetMap(Leaflet)으로 동작합니다. Overpass 주변 시설 조회는 가상 응답으로만 테스트했습니다(개발 환경에서 접속 불가). 단지 좌표(Nominatim 단지명 검색)는 실제 OSM 자료로 시험했으며, OSM 에 등록되지 않은 단지가 많아 전체 단지 중 일부만 위치가 표시됩니다.
- 생활권 중 신대지구·금당지구·오천지구는 법정동 경계와 일치하지 않는 근사 구분입니다(화면에 안내 표시).
- **주택 인허가, 건축물대장, 미분양 통계, 주민등록 인구 연계도 가상 응답으로만 테스트했습니다.** 순천 지역에서 실제로 어떤 코드·지역명으로 응답하는지는 확인되지 않았습니다(참고한 the주택은 수도권만 다룹니다). 주택 인허가는 법정동마다 따로 조회해야 해 한 번에 80개 동씩 나누어 받으므로, 전체가 채워지는 데 며칠 걸립니다.
- 주택 인허가의 사용검사일 항목은 공식 명세의 이름이 서로 바뀐 것으로 보여 표시하지 않습니다.
- **청약 알림은 실제 공고로 확인하지 못했습니다.** 청약홈·LH 공고가 아직 수집되지 않아 가상 공고로만 테스트했습니다. 새 공고 이슈 생성 단계와 브라우저 알림 표시도 실제로 발동된 적이 없습니다.
- LH 분양·임대 공고 연계는 가상 응답으로만 테스트했습니다. 응답의 바깥 구조는 공식 명세에 없어, 구조에 의존하지 않고 공고 목록을 찾도록 작성했습니다.
- 미구현: 관리비(단지당 월 28회 호출이 필요하고 금액 단위가 명세에 없어, K-apt 연결 후 실제 응답으로 확인한 뒤 구현 예정), 통학구역 경계(공개 API 없음), 순천시청 개발·고시 공고(공개 API 없음), 취득세 자동 계산(의도적으로 제외).
- 접근성 자동 검사(axe)는 밝은 화면 기준으로만 실행합니다. 어두운 화면의 색 대비는 자동 검사하지 않았습니다.
- 관심 단지는 브라우저 localStorage 에만 저장됩니다. 기기 간 동기화는 없으며 내보내기·가져오기 파일로 옮길 수 있습니다.

## 8. 참고한 자료

- [the주택 (행정안전부 김민, AI 정부 실험실 공공 저장소)](https://gitlab.aigov.go.kr/acesharp/HOME) — 전국 주택공급 정책 추진현황 시스템.
  이 저장소가 수집하는 공개 원천 목록을 참고해 LH 분양·임대 공고를 연계했습니다.
  해당 저장소에는 라이선스가 지정돼 있지 않아 **코드와 문서는 가져오지 않았고**, 연계 코드는 공공데이터포털의 공식 명세를 보고 새로 작성했습니다.
- 이후 저자의 허락을 받아 그 저장소의 수집기가 쓰는 호출 방식과 응답 항목을 참고해 다음을 연계했습니다(`scripts/collector/supply.py`).
  the주택은 서울·경기·인천만 다루므로 순천 지역 처리와 화면은 이 프로젝트에서 새로 작성했고, 각 API 는 공식 명세와 대조했습니다.
  - [건축HUB 주택인허가정보](https://www.data.go.kr/data/15136560/openapi.do): 법정동별 주택 인허가 사업(향후 공급 가능 단지)
  - [건축물대장](https://www.data.go.kr/data/15134735/openapi.do): 단지 지번의 세대수·동수·층수·주차·건폐율·용적률
  - [국토교통 통계누리](https://stat.molit.go.kr/portal/api/info.do): 순천시 미분양, 준공 후 미분양
  - [KOSIS](https://kosis.kr/openapi/devGuide/devGuide_0201List.do): 순천시 주민등록 인구
- 연계하지 않은 것: 통계누리의 인허가·착공·준공 통계(시도 단위만 공개되어 순천시 값을 얻을 수 없음), SGIS·KOSIS 가구 통계, LH 단지정보.

## 9. 폴더 구조

```
src/                 React 앱 (pages, components, lib, store, config)
scripts/collector/   Python 수집기 (molit, normalize, merge, stats, briefing, validate, enrich, pipeline)
scripts/tests/       수집기 테스트
tools/               빌드 검증·키 노출 점검·아이콘 생성
public/data/         운영 데이터(JSON)
data-cache/          좌표·K-apt 조회 캐시(수집 시 생성)
tests/fixtures/      가상 테스트 데이터(make_fixture.py 로 생성)
e2e/                 브라우저 E2E·접근성 테스트(Playwright)
.github/workflows/   deploy.yml(수집·배포), ci.yml(PR 검증)
```

자세한 요구사항은 [PRD.md](PRD.md) 를 참고하세요.
