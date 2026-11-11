"""국토교통부 아파트 매매 실거래가 상세 자료 조회·XML 파싱."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Callable

from . import config
from .http import ApiError, http_get, normalize_service_key

SUCCESS_CODES = {"00", "000", "0"}
AUTH_HINTS = ("SERVICE_KEY", "SERVICE KEY", "UNREGISTERED", "ACCESS DENIED", "DEADLINE", "LIMITED_NUMBER")


def parse_response(xml_bytes: bytes) -> tuple[list[dict[str, str]], int]:
    """응답 XML → (item 목록, totalCount). 오류 응답이면 ApiError."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        raise ApiError(f"XML 파싱 실패: {e}") from None

    # 공공데이터포털 게이트웨이 오류 형식
    if root.tag == "OpenAPI_ServiceResponse":
        msg = root.findtext(".//returnAuthMsg") or root.findtext(".//errMsg") or "게이트웨이 오류"
        raise ApiError(f"API 오류: {msg}", auth=any(h in msg.upper() for h in AUTH_HINTS))

    code = (root.findtext("header/resultCode") or "").strip()
    msg = (root.findtext("header/resultMsg") or "").strip()
    if code not in SUCCESS_CODES:
        raise ApiError(f"API 오류: resultCode={code or '없음'} {msg}", auth=any(h in msg.upper() for h in AUTH_HINTS))

    body = root.find("body")
    if body is None:
        raise ApiError("응답에 body 가 없습니다.")
    items = [{child.tag: (child.text or "") for child in item} for item in body.iterfind("items/item")]
    total_text = (body.findtext("totalCount") or "").strip()
    if not total_text.isdigit():
        raise ApiError("응답에 totalCount 가 없습니다.")
    return items, int(total_text)


Fetcher = Callable[[str, dict], bytes]


def fetch_rent_month(service_key: str, lawd_cd: str, ym: str, **kw) -> list[dict[str, str]]:
    """전월세 실거래 한 달치. 응답 구조(header/body/items/totalCount)는 매매와 같다."""
    return fetch_month(service_key, lawd_cd, ym, url=config.MOLIT_RENT_URL, **kw)


def _default_fetch(url: str, params: dict) -> bytes:
    return http_get(url, params, secrets=[str(params.get("serviceKey", ""))])


def fetch_month(
    service_key: str,
    lawd_cd: str,
    ym: str,
    *,
    fetch: Fetcher = _default_fetch,
    page_size: int = 1000,
    max_pages: int = 50,
    url: str = config.MOLIT_TRADE_URL,
) -> list[dict[str, str]]:
    """한 시군구·한 계약월의 전체 거래 item. 페이지를 끝까지 읽고 totalCount 와 건수가 맞는지 검증한다."""
    key = normalize_service_key(service_key)
    items: list[dict[str, str]] = []
    total = 0
    for page in range(1, max_pages + 1):
        params = {
            "serviceKey": key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": ym.replace("-", ""),
            "pageNo": page,
            "numOfRows": page_size,
        }
        page_items, total = parse_response(fetch(url, params))
        if page > 1 and page_items and page_items == items[: len(page_items)]:
            # 페이지 파라미터를 무시하고 같은 내용을 다시 주는 서비스: 중복으로 넣지 않고 건수 불일치로 처리
            break
        items.extend(page_items)
        if len(items) >= total or not page_items:
            break
    if len(items) != total:
        raise ApiError(f"{ym} {lawd_cd}: 수신 {len(items)}건이 totalCount {total}건과 다릅니다.")
    return items
