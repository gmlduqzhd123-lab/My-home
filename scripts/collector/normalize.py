"""실거래 원본(문자열 dict) → 정규화된 거래 레코드."""
from __future__ import annotations

import hashlib
import re
from datetime import date


def clean(v: str | None) -> str | None:
    """공백 정리. 빈 문자열은 None."""
    if v is None:
        return None
    v = re.sub(r"\s+", " ", v).strip()
    return v or None


def parse_amount(v: str | None) -> int:
    """'  32,500' → 32500 (만원). 숫자가 아니거나 0 이하면 ValueError."""
    s = (v or "").replace(",", "").strip()
    if not re.fullmatch(r"\d+", s):
        raise ValueError(f"거래금액 형식 오류: {v!r}")
    n = int(s)
    if n <= 0:
        raise ValueError("거래금액이 0 이하")
    return n


def parse_int(v: str | None) -> int | None:
    s = (v or "").strip()
    return int(s) if re.fullmatch(r"-?\d+", s) else None


def parse_area(v: str | None) -> float:
    try:
        a = round(float((v or "").strip()), 2)
    except ValueError:
        raise ValueError(f"전용면적 형식 오류: {v!r}") from None
    if a <= 0:
        raise ValueError("전용면적이 0 이하")
    return a


def parse_deal_date(y: str | None, m: str | None, d: str | None) -> str:
    """계약 년/월/일 → 'YYYY-MM-DD'. 존재하지 않는 날짜면 ValueError."""
    try:
        return date(int(y or ""), int(m or ""), int(d or "")).isoformat()
    except ValueError:
        raise ValueError(f"계약일 형식 오류: {y!r}-{m!r}-{d!r}") from None


def parse_short_date(v: str | None) -> str | None:
    """'25.03.14' / '2025.03.14' / '20250314' / '2025-03-14' → 'YYYY-MM-DD'. 해석 불가면 None."""
    s = (v or "").strip()
    if not s:
        return None
    parts = re.findall(r"\d+", s)
    if len(parts) == 1 and len(parts[0]) == 8:
        parts = [parts[0][:4], parts[0][4:6], parts[0][6:]]
    if len(parts) != 3:
        return None
    y, m, d = (int(p) for p in parts)
    if y < 100:
        y += 2000
    try:
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def normalize_name(name: str) -> str:
    """단지명 표시용 정규화: 앞뒤·중복 공백 제거."""
    return re.sub(r"\s+", " ", name).strip()


def name_key(name: str) -> str:
    """단지 동일성 판단용 키: 공백·괄호·구두점 제거, 소문자."""
    return re.sub(r"[\s()\[\]·.,\-]", "", name).lower()


def complex_id(umd_nm: str, jibun: str | None, apt_nm: str) -> str:
    """단지 식별자. 행정코드(시군구코드·aptSeq)는 2026-07 통합으로 바뀌므로 법정동명+지번+단지명으로 만든다."""
    raw = f"{umd_nm}|{jibun or ''}|{name_key(apt_nm)}"
    return "c" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]


def trade_key(t: dict) -> str:
    """거래 동일성 키(해제·등기 등 사후 변경 필드는 제외)."""
    raw = f"{t['complexId']}|{t['dealDate']}|{t['area']:.2f}|{t['floor']}|{t['price']}"
    return "t" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def normalize_trade(raw: dict[str, str]) -> dict:
    """API item → 거래 레코드(id·firstSeenAt 제외). 필수값이 잘못되면 ValueError."""
    apt_nm = clean(raw.get("aptNm"))
    umd_nm = clean(raw.get("umdNm"))
    if not apt_nm or not umd_nm:
        raise ValueError("아파트명 또는 법정동 누락")
    apt_nm = normalize_name(apt_nm)
    jibun = clean(raw.get("jibun"))
    cdeal_type = clean(raw.get("cdealType"))
    cancel_date = parse_short_date(raw.get("cdealDay"))
    lease = clean(raw.get("landLeaseholdGbn"))
    return {
        "complexId": complex_id(umd_nm, jibun, apt_nm),
        "aptNm": apt_nm,
        "umdNm": umd_nm,
        "jibun": jibun,
        "roadNm": clean(raw.get("roadNm")),
        "dealDate": parse_deal_date(raw.get("dealYear"), raw.get("dealMonth"), raw.get("dealDay")),
        "price": parse_amount(raw.get("dealAmount")),
        "area": parse_area(raw.get("excluUseAr")),
        "floor": parse_int(raw.get("floor")),
        "buildYear": parse_int(raw.get("buildYear")),
        "dealType": clean(raw.get("dealingGbn")),
        # 해제여부(cdealType)가 표시되었거나 해제사유발생일이 있으면 해제 거래
        "cancelled": bool(cdeal_type) or cancel_date is not None,
        "cancelDate": cancel_date,
        "rgstDate": parse_short_date(raw.get("rgstDate")),
        "aptDong": clean(raw.get("aptDong")),
        "buyer": clean(raw.get("buyerGbn")),
        "seller": clean(raw.get("slerGbn")),
        "agentLoc": clean(raw.get("estateAgentSggNm")),
        "landLease": None if lease is None else lease.upper() == "Y",
    }


def normalize_items(items: list[dict[str, str]]) -> tuple[list[dict], list[str]]:
    """여러 item 정규화. (정상 레코드, 거부 사유 목록) 반환."""
    ok: list[dict] = []
    rejected: list[str] = []
    for raw in items:
        try:
            ok.append(normalize_trade(raw))
        except ValueError as e:
            rejected.append(str(e))
    return ok, rejected


def assign_ids(per_source: list[list[dict]]) -> list[dict]:
    """조회 코드(출처)별 결과를 합치며 id 를 부여한다.

    같은 키의 거래가 한 응답 안에 n건 있으면 실제로 n건(같은 날 같은 층·면적·금액)으로 보고 -0, -1… 을 붙인다.
    서로 다른 시군구코드 조회에서 같은 거래가 중복으로 나오면(행정통합 전후 코드) 합산하지 않고 더 많은 쪽만 취한다.
    """
    best: dict[str, list[dict]] = {}
    for trades in per_source:
        grouped: dict[str, list[dict]] = {}
        for t in trades:
            grouped.setdefault(trade_key(t), []).append(t)
        for k, lst in grouped.items():
            if len(lst) > len(best.get(k, [])):
                best[k] = lst
    out: list[dict] = []
    for k, lst in best.items():
        # 같은 키 안에서는 해제되지 않은 거래를 앞 번호로 고정해 id 가 실행마다 흔들리지 않게 한다
        lst = sorted(lst, key=lambda t: (t["cancelled"], t["cancelDate"] or "", t["rgstDate"] or ""))
        for i, t in enumerate(lst):
            out.append({"id": f"{k}-{i}", **t})
    return out
