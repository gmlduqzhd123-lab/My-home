"""선택 연계: 단지 좌표(OpenStreetMap Nominatim), K-apt 공동주택 기본정보, 청약홈 분양정보.

모두 실패해도 실거래 수집에는 영향을 주지 않는다. 확인되지 않은 값은 만들지 않는다.
"""
from __future__ import annotations

import json
import math
import re
import time
from datetime import datetime, timedelta
from typing import Callable

from . import config
from .http import ApiError, http_get, normalize_service_key
from .normalize import name_key, parse_short_date

Get = Callable[..., bytes]


def _json(data: bytes) -> dict:
    try:
        return json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError("JSON 응답이 아닙니다(인증키 미승인 또는 서비스 오류일 수 있음).") from None


def _stale(iso: str | None, now: datetime, days: int) -> bool:
    if not iso:
        return True
    try:
        return now - datetime.fromisoformat(iso) > timedelta(days=days)
    except ValueError:
        return True


# ───────────────────────── 좌표 ─────────────────────────

def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lng2 - lng1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def name_variants(name: str) -> list[str]:
    """OSM 에 단지명이 다르게 적혀 있을 때를 대비한 검색어 후보(앞의 것부터 시도)."""
    bases = [name, name.replace("에스-클래스", "S-클래스").replace("에스클래스", "S클래스")]
    out: list[str] = []
    for b in bases:
        for c in (b, re.sub(r"^순천", "", b)):
            if len(c) >= 2:
                out += [c, c + "아파트"]
    return list(dict.fromkeys(out))


class _Nominatim:
    """OpenStreetMap Nominatim 검색(키 불필요). 이용 정책: 초당 1회 이하, 결과 캐시, 식별 가능한 User-Agent."""

    def __init__(self, get: Get, sleep: Callable[[float], None], budget: int):
        self.get, self.sleep, self.budget = get, sleep, budget

    def search(self, q: str) -> list[dict]:
        if self.budget <= 0:
            raise _BudgetOut
        self.budget -= 1
        self.sleep(config.NOMINATIM_INTERVAL)
        data = self.get(config.NOMINATIM_URL, {"q": q, "format": "jsonv2", "limit": 5, "countrycodes": "kr",
                                               "viewbox": config.SUNCHEON_VIEWBOX, "bounded": 1, "accept-language": "ko"},
                        headers={"User-Agent": config.NOMINATIM_UA})
        try:
            out = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError("Nominatim 응답이 JSON 이 아닙니다.") from None
        return out if isinstance(out, list) else []


class _BudgetOut(Exception):
    pass


_OK_CATEGORY = {"landuse", "building", "place"}


def geocode_complexes(complexes: list[dict], cache: dict, now: datetime, *, get: Get = http_get,
                      sleep: Callable[[float], None] = time.sleep, budget: int = 400,
                      max_dist: float = 2500) -> dict:
    """좌표가 없는 단지를 OpenStreetMap(Nominatim)에서 단지명으로 찾아 cache 에 기록한다.

    지번 주소 검색은 OSM 에 지번이 거의 없어 쓸 수 없다. 대신 단지명 후보로 검색하고,
    결과가 아파트·주거지 성격이며 그 단지 법정동 중심에서 max_dist(m) 안일 때만 좌표로 인정한다.
    찾지 못하면 좌표를 만들지 않고 실패로 기록한다(30일 뒤 재시도). 요청 수는 budget 으로 제한한다.
    """
    nom = _Nominatim(get, sleep, budget)
    centers: dict = cache.setdefault("_centers", {})

    def center(umd: str) -> tuple[float, float] | None:
        if umd not in centers:
            hits = nom.search(", ".join(reversed(umd.split())) + ", 순천시")
            centers[umd] = [float(hits[0]["lat"]), float(hits[0]["lon"])] if hits else None
        return tuple(centers[umd]) if centers[umd] else None

    try:
        for c in complexes:
            entry = cache.get(c["id"])
            if entry and (entry.get("lat") is not None or not _stale(entry.get("at"), now, 30)):
                continue
            if not c.get("name") or not c.get("umdNm"):
                continue
            base = center(c["umdNm"])
            if base is None:
                continue
            found = None
            for q in name_variants(c["name"]):
                for h in nom.search(q):
                    if h.get("category") not in _OK_CATEGORY and h.get("type") not in ("residential", "apartments"):
                        continue
                    try:
                        lat, lng = float(h["lat"]), float(h["lon"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    if _dist_m(base[0], base[1], lat, lng) <= max_dist:
                        found = (round(lat, 6), round(lng, 6), q, h.get("name"))
                        break
                if found:
                    break
            if found:
                cache[c["id"]] = {"lat": found[0], "lng": found[1], "source": "OpenStreetMap(Nominatim) 단지명 검색",
                                  "query": found[2], "osmName": found[3], "at": now.isoformat()}
            else:
                cache[c["id"]] = {"lat": None, "lng": None, "source": None, "query": c["name"], "at": now.isoformat()}
    except _BudgetOut:
        pass  # 나머지는 다음 수집 때 이어서 찾는다
    return cache


# ───────────────────────── K-apt ─────────────────────────

def _body(data: dict) -> dict:
    d = data.get("response", data)
    code = str((d.get("header") or {}).get("resultCode", ""))
    if code not in ("00", "000", "0"):
        msg = (d.get("header") or {}).get("resultMsg", "")
        raise ApiError(f"K-apt API 오류: resultCode={code or '없음'} {msg}")
    return d.get("body") or {}


def _int(v) -> int | None:
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None


def _str(v) -> str | None:
    s = str(v).strip() if v is not None else ""
    return s or None


def fetch_kapt_list(key: str, sigungu_code: str, *, get: Get = http_get) -> list[dict]:
    items: list[dict] = []
    for page in range(1, 30):
        body = _body(_json(get(config.KAPT_LIST_URL, {"serviceKey": key, "sigunguCode": sigungu_code,
                                                      "pageNo": page, "numOfRows": 500}, secrets=[key])))
        got = body.get("items") or []
        items += got
        if not got or len(items) >= int(body.get("totalCount") or 0):
            break
    return items


def fetch_kapt_info(key: str, kapt_code: str, now_iso: str, *, get: Get = http_get) -> dict:
    basic = _body(_json(get(config.KAPT_BASIC_URL, {"serviceKey": key, "kaptCode": kapt_code}, secrets=[key]))).get("item") or {}
    try:  # 상세정보 오퍼레이션은 명세상 키 파라미터명이 ServiceKey(대문자 S)
        detail = _body(_json(get(config.KAPT_DETAIL_URL, {"ServiceKey": key, "kaptCode": kapt_code}, secrets=[key]))).get("item") or {}
    except ApiError:
        detail = {}
    ground, under = _int(detail.get("kaptdPcnt")), _int(detail.get("kaptdPcntu"))
    return {
        "kaptCode": kapt_code,
        "name": _str(basic.get("kaptName")),
        "addr": _str(basic.get("kaptAddr")),
        "roadAddress": _str(basic.get("doroJuso")),
        "households": _int(basic.get("kaptdaCnt")),
        "dongCount": _int(basic.get("kaptDongCnt")),
        "topFloor": _int(basic.get("kaptTopFloor")),
        "useDate": parse_short_date(_str(basic.get("kaptUsedate"))),
        "heating": _str(basic.get("codeHeatNm")),
        "hallType": _str(basic.get("codeHallNm")),
        "builder": _str(basic.get("kaptBcompany")),
        "parkingTotal": None if ground is None and under is None else (ground or 0) + (under or 0),
        "welfare": _str(detail.get("welfareFacility")),
        "convenient": _str(detail.get("convenientFacility")),
        "education": _str(detail.get("educationFacility")),
        "busTime": _str(detail.get("kaptdWtimebus")),
        "fetchedAt": now_iso,
    }


def update_kapt_cache(cache: dict, key: str, now: datetime, *, get: Get = http_get, limit: int = 400) -> dict:
    """순천시 단지 목록을 받아 기본정보를 cache['items'][kaptCode] 에 채운다(30일 지난 항목만 재조회)."""
    key = normalize_service_key(key)
    listing: list[dict] = []
    for code in config.LAWD_CODES:
        try:
            listing = fetch_kapt_list(key, code, get=get)
        except ApiError as e:
            if e.auth:
                raise
            continue
        if listing:
            break
    if not listing:
        raise ApiError("K-apt 단지 목록이 비어 있습니다.")
    items = cache.setdefault("items", {})
    done = 0
    for row in listing:
        code = _str(row.get("kaptCode"))
        if not code or done >= limit:
            continue
        if code in items and not _stale(items[code].get("fetchedAt"), now, 30):
            continue
        items[code] = fetch_kapt_info(key, code, now.isoformat(), get=get)
        done += 1
    # 단지 목록의 읍면동(as3)·리(as4)를 법정동명으로 기록한다(실거래의 umdNm 과 같은 형태)
    for row in listing:
        code = _str(row.get("kaptCode"))
        if code in items:
            items[code]["umd"] = " ".join(x for x in (_str(row.get("as3")), _str(row.get("as4"))) if x) or None
    return cache


def _strip_apt(key: str) -> str:
    return re.sub(r"(아파트|apt)$", "", key)


def match_kapt(complexes: list[dict], kapt_items: dict) -> dict:
    """K-apt 단지 ↔ 실거래 단지 매칭. 법정동이 같고 (지번 일치 또는 단지명 일치)이며 후보가 유일할 때만 연결한다."""
    out: dict[str, dict] = {}
    entries = [e for e in kapt_items.values() if e.get("addr") or e.get("name")]
    for c in complexes:
        dong = c["umdNm"].split()[-1]
        cands = [e for e in entries if dong in (e.get("addr") or "")]
        hit: list[dict] = []
        if c.get("jibun"):
            hit = [e for e in cands if c["jibun"] in re.split(r"[\s,]+", e.get("addr") or "")]
        if len(hit) != 1:
            ck = _strip_apt(name_key(c["name"]))
            hit = [e for e in cands if e.get("name") and _strip_apt(name_key(e["name"])) == ck]
        if len(hit) == 1:
            e = hit[0]
            out[c["id"]] = {k: e.get(k) for k in (
                "kaptCode", "roadAddress", "households", "dongCount", "topFloor", "useDate", "heating",
                "hallType", "builder", "parkingTotal", "welfare", "convenient", "education", "busTime", "fetchedAt")}
    return out


def unmatched_kapt(kapt_items: dict, kapt_by_complex: dict) -> list[dict]:
    """실거래 단지와 연결되지 않은 K-apt 단지(수집 기간에 거래가 없던 단지). 이름·법정동이 확인된 것만."""
    used = {v.get("kaptCode") for v in kapt_by_complex.values()}
    return [e for code, e in sorted(kapt_items.items())
            if code not in used and e.get("name") and e.get("umd") and e.get("kaptCode")]


# ───────────────────────── 청약홈 ─────────────────────────

def fetch_presales(key: str, *, get: Get = http_get) -> list[dict]:
    """청약홈 APT 분양정보 중 공급위치에 '순천'이 포함된 공고."""
    key = normalize_service_key(key)
    data = _json(get(config.APPLYHOME_URL, {"page": 1, "perPage": 100, "returnType": "JSON",
                                            "cond[HSSPLY_ADRES::LIKE]": "순천", "serviceKey": key}, secrets=[key]))
    if "data" not in data:
        raise ApiError(f"청약홈 API 오류: {data.get('msg') or '응답 형식 오류'}")
    out = []
    for r in data["data"]:
        addr = _str(r.get("HSSPLY_ADRES")) or ""
        name = _str(r.get("HOUSE_NM"))
        if "순천시" not in addr or not name:  # '순천향로' 같은 다른 지역 주소 제외
            continue
        out.append({
            "id": f"{r.get('HOUSE_MANAGE_NO')}-{r.get('PBLANC_NO')}",
            "name": name,
            "location": addr,
            "households": _int(r.get("TOT_SUPLY_HSHLDCO")),
            "announceDate": parse_short_date(_str(r.get("RCRIT_PBLANC_DE"))),
            "receiptStart": parse_short_date(_str(r.get("RCEPT_BGNDE"))),
            "receiptEnd": parse_short_date(_str(r.get("RCEPT_ENDDE"))),
            "winnerDate": parse_short_date(_str(r.get("PRZWNER_PRESNATN_DE"))),
            "contractStart": parse_short_date(_str(r.get("CNTRCT_CNCLS_BGNDE"))),
            "contractEnd": parse_short_date(_str(r.get("CNTRCT_CNCLS_ENDDE"))),
            "moveInMonth": _str(r.get("MVN_PREARNGE_YM")),
            "url": _str(r.get("PBLANC_URL")),
            "prices": [],  # 주택형별 분양가는 별도 오퍼레이션(미연계) — 모집공고에서 확인
        })
    out.sort(key=lambda p: p["announceDate"] or "", reverse=True)
    for p in out[:20]:  # 최근 공고만 주택형별 분양가를 붙인다(실패하면 빈 목록 그대로)
        try:
            p["prices"] = fetch_presale_prices(key, p["id"].split("-")[0], get=get)
        except ApiError:
            pass
    return out


def fetch_presale_prices(key: str, house_manage_no: str, *, get: Get = http_get) -> list[dict]:
    """주택형별 공급금액(분양최고금액, 만원). 금액이 숫자가 아닌 행은 넣지 않는다."""
    data = _json(get(config.APPLYHOME_MDL_URL, {"page": 1, "perPage": 100, "returnType": "JSON",
                                                "cond[HOUSE_MANAGE_NO::EQ]": house_manage_no, "serviceKey": key},
                     secrets=[key]))
    if "data" not in data:
        raise ApiError(f"청약홈 API 오류: {data.get('msg') or '응답 형식 오류'}")
    out = []
    for r in data["data"]:
        amount = str(r.get("LTTOT_TOP_AMOUNT") or "").replace(",", "").strip()
        house_ty = _str(r.get("HOUSE_TY"))
        if not house_ty or not amount.isdigit() or int(amount) <= 0:
            continue
        out.append({"type": house_ty, "price": int(amount), "supplyArea": _str(r.get("SUPLY_AR")),
                    "households": (_int(r.get("SUPLY_HSHLDCO")) or 0) + (_int(r.get("SPSPLY_HSHLDCO")) or 0)})
    return out


# ───────────────────────── LH 분양·임대 공고 ─────────────────────────

def _find_rows(obj, field: str) -> list[dict]:
    """응답 JSON 어디에 있든 field 를 가진 dict 목록을 찾아 반환한다(봉투 구조에 의존하지 않기 위해)."""
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj) and any(field in x for x in obj):
            return obj
        for x in obj:
            found = _find_rows(x, field)
            if found:
                return found
    elif isinstance(obj, dict):
        for v in obj.values():
            found = _find_rows(v, field)
            if found:
                return found
    return []


def fetch_lh_notices(key: str, now: datetime, *, get: Get = http_get, months: int = 24) -> list[dict]:
    """LH 분양·임대 공고 중 공고명에 '순천'이 들어간 것. 최근 months 개월 게시분."""
    key = normalize_service_key(key)
    start = now - timedelta(days=months * 31)
    rows: list[dict] = []
    for page in range(1, 11):
        data = _json(get(config.LH_NOTICE_URL, {
            "ServiceKey": key, "PG_SZ": 100, "PAGE": page, "PAN_NM": "순천",
            "PAN_NT_ST_DT": start.strftime("%Y.%m.%d"), "CLSG_DT": now.strftime("%Y.%m.%d")}, secrets=[key]))
        if isinstance(data, dict) and "OpenAPI_ServiceResponse" in data:
            msg = (data["OpenAPI_ServiceResponse"].get("cmmMsgHeader") or {}).get("returnAuthMsg", "인증 오류")
            raise ApiError(f"LH 공고 API 오류: {msg}", auth=True)
        got = _find_rows(data, "PAN_NM")
        rows += got
        if len(got) < 100:
            break
    out, seen = [], set()
    for r in rows:
        title, url = _str(r.get("PAN_NM")), _str(r.get("DTL_URL"))
        if not title or "순천" not in title:
            continue
        m = re.search(r"PAN_ID:(\w+)", url or "")
        nid = m.group(1) if m else "lh-" + name_key(title)[:40]
        if nid in seen:
            continue
        seen.add(nid)
        out.append({
            "id": nid,
            "title": title,
            "kind": " · ".join(x for x in (_str(r.get("UPP_AIS_TP_NM")), _str(r.get("AIS_TP_CD_NM"))) if x) or None,
            "status": _str(r.get("PAN_SS")),
            "region": _str(r.get("CNP_CD_NM")),
            "date": parse_short_date(_str(r.get("PAN_NT_ST_DT"))),
            "closeDate": parse_short_date(_str(r.get("CLSG_DT"))),
            "url": url,
            "source": "LH 분양·임대 공고",
        })
    out.sort(key=lambda x: (x["date"] or "", x["id"]), reverse=True)
    return out


# ───────────────────────── 한국부동산원 가격지수 ─────────────────────────

def fetch_price_index(key: str, *, get: Get = http_get) -> list[dict]:
    """(월) 아파트 매매가격지수 — 순천시. [{ym, value}] 오름차순."""
    data = _json(get(config.REB_DATA_URL, {
        "KEY": key, "Type": "json", "pIndex": 1, "pSize": 1000, "STATBL_ID": config.REB_INDEX_TABLE,
        "DTACYCLE_CD": "MM", "CLS_ID": config.REB_INDEX_CLS, "ITM_ID": config.REB_INDEX_ITM}, secrets=[key]))
    block = data.get("SttsApiTblData")
    if not isinstance(block, list) or len(block) < 2:
        result = data.get("RESULT") or {}
        raise ApiError(f"R-ONE API 오류: {result.get('CODE', '')} {result.get('MESSAGE', '응답 형식 오류')}")
    out = []
    for r in block[1].get("row") or []:
        ym = str(r.get("WRTTIME_IDTFR_ID") or "")
        # 다른 지역·항목이 섞여 오면 버린다
        if len(ym) != 6 or not ym.isdigit() or not str(r.get("CLS_FULLNM") or "").endswith("순천시"):
            continue
        try:
            out.append({"ym": f"{ym[:4]}-{ym[4:]}", "value": round(float(r["DTA_VAL"]), 2)})
        except (KeyError, TypeError, ValueError):
            continue
    if not out:
        raise ApiError("R-ONE 응답에 순천시 지수가 없습니다.")
    out.sort(key=lambda x: x["ym"])
    return out


# ───────────────────────── 학교 위치 ─────────────────────────

def fetch_schools(key: str, *, get: Get = http_get) -> list[dict]:
    """순천교육지원청 관할 초·중·고 위치. 서버 필터가 듣지 않아도 주소로 다시 걸러 순천시 학교만 남긴다."""
    key = normalize_service_key(key)
    rows: list[dict] = []
    for page in range(1, 21):
        data = _json(get(config.SCHOOL_URL, {"serviceKey": key, "pageNo": page, "numOfRows": 1000, "type": "json",
                                             "edcSport": config.SCHOOL_EDC_SPORT}, secrets=[key]))
        if "OpenAPI_ServiceResponse" in data:
            msg = (data["OpenAPI_ServiceResponse"].get("cmmMsgHeader") or {}).get("returnAuthMsg", "인증 오류")
            raise ApiError(f"학교 위치 API 오류: {msg}", auth=True)
        d = data.get("response", data)
        code = str((d.get("header") or {}).get("resultCode", ""))
        if code == "03":  # NODATA
            break
        if code not in ("00", "0"):
            raise ApiError(f"학교 위치 API 오류: resultCode={code or '없음'}")
        items = (d.get("body") or {}).get("items") or []
        if isinstance(items, dict):
            items = items.get("item") or []
        rows += items
        if len(items) < 1000:
            break
    out, seen = [], set()
    for r in rows:
        addr = _str(r.get("rdnmadr")) or _str(r.get("lnmadr")) or ""
        sid, name = _str(r.get("schoolId")), _str(r.get("schoolNm"))
        if "순천시" not in addr or not sid or not name or sid in seen:
            continue
        if _str(r.get("operSttus")) not in (None, "운영"):
            continue
        seen.add(sid)
        try:
            lat, lng = round(float(r["latitude"]), 6), round(float(r["longitude"]), 6)
            if not (33 <= lat <= 39 and 124 <= lng <= 132):
                lat = lng = None
        except (KeyError, TypeError, ValueError):
            lat = lng = None
        out.append({"id": sid, "name": name, "kind": _str(r.get("schoolSe")) or "학교", "address": addr, "lat": lat, "lng": lng})
    out.sort(key=lambda s: (s["kind"], s["name"]))
    return out
