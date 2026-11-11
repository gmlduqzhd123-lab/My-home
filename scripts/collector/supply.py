"""주택 공급·건물·지역 통계 연계 (선택 연계 — 실패해도 실거래 수집에 영향 없음).

호출 방식과 응답 항목은 the주택(행정안전부 김민, https://gitlab.aigov.go.kr/acesharp/HOME)의 수집기를
저자의 허락을 받아 참고했고, 공공데이터포털·통계누리·KOSIS 의 공식 명세와 대조했다.
the주택은 서울·경기·인천만 다루므로 순천 지역 코드·지역명 처리는 이 프로젝트에서 새로 작성했다.

- 건축HUB 주택인허가정보 (data.go.kr 15136560): 법정동별 주택 인허가 사업
- 건축물대장 총괄표제부·표제부 (15134735): 단지 지번의 세대수·주차·건폐율·용적률
- 국토교통 통계누리: 시군구 미분양, 준공 후 미분양
- KOSIS: 주민등록 인구
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timedelta
from typing import Callable

from . import config
from .enrich import _int, _json, _stale, _str
from .http import ApiError, http_get, normalize_service_key
from .normalize import parse_short_date

Get = Callable[..., bytes]

HUB_PERMIT_URL = "https://apis.data.go.kr/1613000/HsPmsHubService/getHpBasisOulnInfo"
HUB_PERMIT_PAGE = "https://www.data.go.kr/data/15136560/openapi.do"
REGISTER_RECAP_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo"
REGISTER_TITLE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
REGISTER_PAGE = "https://www.data.go.kr/data/15134735/openapi.do"
BJDONG_ZIP_URL = "https://www.code.go.kr/etc/codeFullDown.do"
MOLIT_STAT_URL = "https://stat.molit.go.kr/portal/openapi/service/rest/getList.do"
MOLIT_STAT_PAGE = "https://stat.molit.go.kr/portal/api/info.do"
UNSOLD_FORM = ("2082", "128")  # 미분양현황(시군구)
UNSOLD_DONE_FORM = ("5328", "1")  # 준공 후 미분양(시군구·부문·규모)
KOSIS_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
KOSIS_PAGE = "https://kosis.kr/openapi/devGuide/devGuide_0201List.do"
KOSIS_POP_TABLE = "DT_1B04005N"  # 행정구역(시군구)별·5세별 주민등록인구

SIGUNGU_NAME = "순천시"


def hub_items(data: dict, what: str) -> tuple[list[dict], int]:
    """건축HUB 계열 JSON 응답 → (item 목록, totalCount). item 이 1건이면 dict 로 오므로 목록으로 감싼다."""
    if "OpenAPI_ServiceResponse" in data:
        msg = (data["OpenAPI_ServiceResponse"].get("cmmMsgHeader") or {}).get("returnAuthMsg", "인증 오류")
        raise ApiError(f"{what} API 오류: {msg}", auth=True)
    d = data.get("response", data)
    code = str((d.get("header") or {}).get("resultCode", ""))
    if code not in ("00", "0"):
        raise ApiError(f"{what} API 오류: resultCode={code or '없음'} {(d.get('header') or {}).get('resultMsg', '')}")
    body = d.get("body") or {}
    items = body.get("items") or {}
    rows = items.get("item") if isinstance(items, dict) else items
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        rows = []
    return rows, _int(body.get("totalCount")) or 0


def fetch_hub_all(url: str, params: dict, what: str, *, get: Get, cap: int = 3000) -> list[dict]:
    """페이지를 끝까지 읽는다. 받은 건수가 totalCount 와 다르면 불완전한 응답으로 보고 실패 처리한다."""
    rows: list[dict] = []
    total = 0
    for page in range(1, cap // 100 + 2):
        got, total = hub_items(_json(get(url, {**params, "numOfRows": 100, "pageNo": page, "_type": "json"},
                                         secrets=[str(params.get("serviceKey", ""))])), what)
        rows += got
        if not got or len(rows) >= min(total, cap):
            break
    if len(rows) < min(total, cap):
        raise ApiError(f"{what}: 수신 {len(rows)}건이 totalCount {total}건보다 적습니다.")
    return rows


# ───────────────────────── 법정동 목록 ─────────────────────────

def fetch_bjdongs(sigungu_codes: list[str], *, get: Get = http_get) -> dict[str, str]:
    """행정표준코드관리시스템의 법정동코드 전체자료에서 해당 시군구의 {법정동코드 뒤 5자리: 법정동명}."""
    raw = get(BJDONG_ZIP_URL, {"codeseId": "법정동코드"}, timeout=90)
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            text = z.read(z.namelist()[0]).decode("cp949", errors="replace")
    except (zipfile.BadZipFile, IndexError, KeyError):
        raise ApiError("법정동코드 자료를 읽지 못했습니다.") from None
    out: dict[str, str] = {}
    for line in text.splitlines()[1:]:
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        code, name, state = cols[0].strip(), cols[1].strip(), cols[2].strip()
        if state == "존재" and len(code) == 10 and code[:5] in sigungu_codes and code[5:] != "00000":
            out[code[5:]] = name
    return out


# ───────────────────────── 주택 인허가 ─────────────────────────

def _permit(r: dict, dong_name: str) -> dict | None:
    pk, addr = _str(r.get("mgmHsrgstPk")), _str(r.get("platPlc"))
    # 다른 지역 자료가 섞여 오면 버린다
    if not pk or not addr or SIGUNGU_NAME not in addr:
        return None
    return {
        "id": pk,
        "name": _str(r.get("bldNm")),
        "address": addr,
        "dong": dong_name,
        "households": _int(r.get("totHhldCnt")),
        "purpose": _str(r.get("purpsCdNm")) or _str(r.get("mainPurpsCdNm")),
        "permitDate": parse_short_date(_str(r.get("apprvDay"))),
        "startDate": parse_short_date(_str(r.get("stcnsDay"))),
        "startPlanDate": parse_short_date(_str(r.get("stcnsSchedDay"))),
        # 사용검사일 항목(useInsptDay/useInsptSchedDay)은 공식 명세의 이름이 서로 바뀐 것으로 보여 쓰지 않는다
    }


def update_permits(cache: dict, key: str, dongs: dict[str, str], now: datetime, *, get: Get = http_get,
                   limit: int = 80, revisit_days: int = 7) -> dict:
    """법정동별 주택 인허가를 cache['dongs'][법정동코드] 에 채운다. 한 번에 limit 개 동, 7일 지난 동만 다시 조회."""
    key = normalize_service_key(key)
    store = cache.setdefault("dongs", {})
    done = 0
    for code in sorted(dongs, key=lambda c: (store.get(c, {}).get("at") or "", c)):  # 오래된 동부터
        if done >= limit:
            break
        if code in store and not _stale(store[code].get("at"), now, revisit_days):
            continue
        rows = fetch_hub_all(HUB_PERMIT_URL, {"serviceKey": key, "sigunguCd": config.PRIMARY_LAWD, "bjdongCd": code},
                             "주택 인허가", get=get)
        items = [p for p in (_permit(r, dongs[code]) for r in rows) if p]
        store[code] = {"at": now.isoformat(), "name": dongs[code], "items": items}
        done += 1
    return cache


def permit_items(cache: dict, now: datetime, *, years: int = 6, min_households: int = 20) -> list[dict]:
    """최근 years 년 안에 허가된 min_households 세대 이상 사업. 허가일 최신순."""
    since = (now - timedelta(days=365 * years)).date().isoformat()
    seen: dict[str, dict] = {}
    for d in cache.get("dongs", {}).values():
        for p in d.get("items", []):
            if (p.get("households") or 0) >= min_households and (p.get("permitDate") or "") >= since:
                seen[p["id"]] = {**p, "status": "착공" if p.get("startDate") else "허가"}
    return sorted(seen.values(), key=lambda p: (p["permitDate"] or "", p["id"]), reverse=True)


# ───────────────────────── 건축물대장 ─────────────────────────

def _f(v) -> float | None:
    try:
        x = float(str(v).strip())
        return round(x, 2) if x > 0 else None
    except (TypeError, ValueError):
        return None


def _parking(r: dict) -> int | None:
    tot = _int(r.get("totPkngCnt"))
    if tot:
        return tot
    parts = [_int(r.get(k)) for k in ("indrMechUtcnt", "oudrMechUtcnt", "indrAutoUtcnt", "oudrAutoUtcnt")]
    s = sum(p or 0 for p in parts)
    return s or None


def fetch_building(key: str, codes: dict, now_iso: str, *, get: Get = http_get) -> dict | None:
    """한 지번의 건축물대장 요약. 총괄표제부가 있으면 그것을, 없으면 표제부(동별)를 합쳐서 만든다. 없으면 None."""
    params = {"serviceKey": key, "sigunguCd": codes["sigunguCd"], "bjdongCd": codes["bjdongCd"],
              "bun": codes["bun"], "ji": codes["ji"]}
    plat = {"1": "0", "2": "1"}.get(str(codes.get("landCd") or ""))  # 실거래 대지구분 → 건축물대장 대지구분
    if plat is not None:
        params["platGbCd"] = plat

    def same_lot(r: dict) -> bool:  # 요청한 지번의 자료만 쓴다
        return str(r.get("bun", "")).zfill(4) == codes["bun"] and str(r.get("ji", "")).zfill(4) == codes["ji"]

    recap = [r for r in fetch_hub_all(REGISTER_RECAP_URL, params, "건축물대장", get=get, cap=300) if same_lot(r)]
    titles = [r for r in fetch_hub_all(REGISTER_TITLE_URL, params, "건축물대장", get=get, cap=600) if same_lot(r)]
    housing = [t for t in titles if "주택" in (_str(t.get("mainPurpsCdNm")) or "")]
    if not recap and not housing:
        return None
    floors = [x for x in (_int(t.get("grndFlrCnt")) for t in housing) if x]
    basements = [x for x in (_int(t.get("ugrndFlrCnt")) for t in housing) if x]
    if recap:
        r = max(recap, key=lambda x: _int(x.get("hhldCnt")) or 0)
        info = {"households": _int(r.get("hhldCnt")) or None, "dongCount": _int(r.get("mainBldCnt")) or (len(housing) or None),
                "parking": _parking(r), "coverageRatio": _f(r.get("bcRat")), "floorAreaRatio": _f(r.get("vlRat")),
                "useDate": parse_short_date(_str(r.get("useAprDay"))), "name": _str(r.get("bldNm")),
                "basis": "건축물대장 총괄표제부"}
    else:
        hh = sum(_int(t.get("hhldCnt")) or 0 for t in housing)
        park = sum(_parking(t) or 0 for t in housing)
        dates = sorted(d for d in (parse_short_date(_str(t.get("useAprDay"))) for t in housing) if d)
        info = {"households": hh or None, "dongCount": len(housing), "parking": park or None,
                "coverageRatio": _f(housing[0].get("bcRat")), "floorAreaRatio": _f(housing[0].get("vlRat")),
                "useDate": dates[0] if dates else None, "name": _str(housing[0].get("bldNm")),
                "basis": "건축물대장 표제부(동별 합산)"}
    info.update({"topFloor": max(floors) if floors else None, "basementFloors": max(basements) if basements else None,
                 "fetchedAt": now_iso})
    return info


def update_buildings(cache: dict, key: str, codes_by_complex: dict, now: datetime, *, get: Get = http_get,
                     limit: int = 120, refresh_days: int = 90) -> dict:
    """지번 코드가 확인된 단지의 건축물대장 요약을 cache[단지 id] 에 채운다(90일 지난 것만 다시 조회)."""
    key = normalize_service_key(key)
    done = 0
    for cid in sorted(codes_by_complex):
        if done >= limit:
            break
        entry = cache.get(cid)
        if entry and not _stale(entry.get("at"), now, refresh_days):
            continue
        info = fetch_building(key, codes_by_complex[cid], now.isoformat(), get=get)
        cache[cid] = {"at": now.isoformat(), "info": info}
        done += 1
    return cache


# ───────────────────────── 통계누리: 미분양 ─────────────────────────

def _stat_rows(key: str, form: tuple[str, str], ym: str, *, get: Get) -> list[dict]:
    data = _json(get(MOLIT_STAT_URL, {"key": key, "form_id": form[0], "style_num": form[1],
                                      "start_dt": ym.replace("-", ""), "end_dt": ym.replace("-", "")}, secrets=[key]))
    status = str((data.get("result_status") or {}).get("status_code", ""))
    if status == "INFO-200":  # 해당 기간 자료 없음 — 0 으로 보지 않는다
        return []
    if status != "INFO-000":
        raise ApiError(f"통계누리 API 오류: {status or '응답 형식 오류'} {(data.get('result_status') or {}).get('message', '')}")
    result = data.get("result_data") or {}
    if "호" not in str(result.get("unitName", "호")):
        raise ApiError(f"통계누리: 단위가 '호'가 아닙니다({result.get('unitName')}).")
    rows = result.get("formList") or []
    return rows if isinstance(rows, list) else []


def _num(v) -> int | None:
    s = str(v if v is not None else "").replace(",", "").strip()
    return int(s) if s.lstrip("-").isdigit() else None


def _suncheon(rows: list[dict]) -> list[dict]:
    return [r for r in rows if str(r.get("시군구", "")).strip() == SIGUNGU_NAME]


def fetch_unsold(key: str, yms: list[str], *, get: Get = http_get) -> dict[str, dict]:
    """{ym: {unsold, afterCompletion}} — 순천시 미분양 호수. 자료가 없는 달은 넣지 않는다."""
    out: dict[str, dict] = {}
    for ym in yms:
        total = next((_num(r.get("미분양현황")) for r in _suncheon(_stat_rows(key, UNSOLD_FORM, ym, get=get))), None)
        if total is None:
            continue
        done_rows = [r for r in _suncheon(_stat_rows(key, UNSOLD_DONE_FORM, ym, get=get))
                     if str(r.get("부문", "계")).strip() == "계" and str(r.get("규모", "계")).strip() == "계"]
        after = next((_num(r.get("호")) for r in done_rows), None)
        if after is not None and after > total:
            after = None  # 준공 후 미분양이 전체보다 클 수는 없다 — 믿을 수 없는 값은 버린다
        out[ym] = {"unsold": total, "afterCompletion": after}
    return out


# ───────────────────────── KOSIS: 주민등록 인구 ─────────────────────────

def fetch_population(key: str, start_ym: str, end_ym: str, *, get: Get = http_get) -> list[dict]:
    """순천시 주민등록 총인구(월별). [{ym, value}] 오름차순."""
    data = json.loads(get(KOSIS_URL, {
        "method": "getList", "apiKey": key, "orgId": "101", "tblId": KOSIS_POP_TABLE, "objL1": "ALL", "objL2": "0",
        "itmId": "T2", "prdSe": "M", "startPrdDe": start_ym.replace("-", ""), "endPrdDe": end_ym.replace("-", ""),
        "format": "json", "jsonVD": "Y"}, secrets=[key], timeout=60).decode("utf-8"))
    if isinstance(data, dict):
        if str(data.get("err")) == "30":
            return []
        raise ApiError(f"KOSIS API 오류: {data.get('err', '')} {data.get('errMsg', '응답 형식 오류')}")
    out = []
    for r in data:
        ym, name = str(r.get("PRD_DE") or ""), str(r.get("C1_NM") or "").strip()
        # 시도 합계가 아닌 시군구 행(코드 5자리)만
        if name != SIGUNGU_NAME or len(ym) != 6 or len(str(r.get("C1") or "")) != 5:
            continue
        value = _num(r.get("DT"))
        if value:
            out.append({"ym": f"{ym[:4]}-{ym[4:]}", "value": value})
    out.sort(key=lambda x: x["ym"])
    return out
