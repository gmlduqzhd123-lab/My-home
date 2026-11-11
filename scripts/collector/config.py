"""경로·엔드포인트·지역 설정.

엔드포인트와 필드명은 2026-11-11 공공데이터포털 공식 명세(Swagger)에서 확인한 값이다.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("SUNCHEON_DATA_DIR") or ROOT / "public" / "data")
CACHE_DIR = Path(os.environ.get("SUNCHEON_CACHE_DIR") or ROOT / "data-cache")
ZONES_FILE = ROOT / "src" / "config" / "zones.json"

SCHEMA_VERSION = 1
KST = timezone(timedelta(hours=9))

REGION_NAME = "순천시"
# 법정동 시군구코드(앞 5자리).
#  - 12150: 전남광주통합특별시 순천시 (2026-07-01 신설, 행정표준코드관리시스템 확인)
#  - 46150: 전라남도 순천시 (2026-07-01 폐지)
# 2026-11-11 실제 수집으로 확인: 12150 이 통합 이전 계약분(2021-12~)까지 모두 제공하고 46150 은 0건이다.
# 그래서 기본값은 12150 하나만 조회한다. 여러 코드를 쉼표로 지정하면 모두 조회해 중복을 제거한다.
LAWD_CODES = [c.strip() for c in os.environ.get("SUNCHEON_LAWD_CODES", "12150").split(",") if c.strip()]
PRIMARY_LAWD = LAWD_CODES[0]

# 국토교통부 아파트 매매 실거래가 상세 자료 (https://www.data.go.kr/data/15126468/openapi.do)
MOLIT_TRADE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
MOLIT_TRADE_PAGE = "https://www.data.go.kr/data/15126468/openapi.do"
# 국토교통부 아파트 전월세 실거래가 자료 (https://www.data.go.kr/data/15126474/openapi.do)
MOLIT_RENT_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
MOLIT_RENT_PAGE = "https://www.data.go.kr/data/15126474/openapi.do"
SOURCE_RENT = "국토교통부 아파트 전월세 실거래가 자료"
# 국토교통부 공동주택 단지 목록 / 기본정보 (K-apt)
KAPT_LIST_URL = "https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4"
KAPT_LIST_PAGE = "https://www.data.go.kr/data/15057332/openapi.do"
KAPT_BASIC_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5"
KAPT_DETAIL_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5"
KAPT_BASIC_PAGE = "https://www.data.go.kr/data/15058453/openapi.do"
# 한국부동산원 청약홈 분양정보 조회 서비스
APPLYHOME_URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail"
APPLYHOME_PAGE = "https://www.data.go.kr/data/15098547/openapi.do"
# 청약홈 주택형별 상세(분양가) — 같은 서비스의 다른 오퍼레이션
APPLYHOME_MDL_URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl"
# 한국부동산원 부동산통계(R-ONE) Open API — 인증키는 R-ONE 사이트에서 별도 발급(공공데이터포털 키 아님)
REB_DATA_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
REB_PAGE = "https://www.reb.or.kr/r-one/portal/openapi/openApiDevPage.do"
REB_INDEX_TABLE = "A_2024_00045"  # (월) 매매가격지수_아파트
REB_INDEX_CLS = "510094"  # 전남광주>전남>순천시
REB_INDEX_ITM = "100001"  # 지수
# 전국초중등학교위치표준데이터 (한국교육시설안전원)
SCHOOL_URL = "https://api.data.go.kr/openapi/tn_pubr_public_elesch_mskul_lc_api"
SCHOOL_PAGE = "https://www.data.go.kr/data/15021148/standard.do"
SCHOOL_EDC_SPORT = "8522000"  # 전남광주통합특별시순천교육지원청
# 한국토지주택공사 분양임대공고문 조회 서비스 (https://www.data.go.kr/data/15058530/openapi.do)
LH_NOTICE_URL = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1"
LH_NOTICE_PAGE = "https://www.data.go.kr/data/15058530/openapi.do"
# Kakao Local 주소 검색(좌표 변환)
KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"

SOURCE_TRADE = "국토교통부 아파트 매매 실거래가 상세 자료"

DEFAULT_INITIAL_MONTHS = 24
DEFAULT_REFRESH_MONTHS = 12


def now_kst() -> datetime:
    return datetime.now(KST).replace(microsecond=0)


def load_zones() -> list[dict]:
    return json.loads(ZONES_FILE.read_text(encoding="utf-8"))


def recent_yms(now: datetime, months: int) -> list[str]:
    """now 가 속한 달을 포함해 과거 months 개월의 'YYYY-MM' (오름차순)."""
    total = now.year * 12 + (now.month - 1)
    out = []
    for i in range(months - 1, -1, -1):
        t = total - i
        out.append(f"{t // 12}-{t % 12 + 1:02d}")
    return out
