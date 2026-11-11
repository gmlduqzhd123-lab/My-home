"""통계·단지 요약 생성."""
from __future__ import annotations

from collections import Counter, defaultdict

from .merge import is_active


def js_round(x: float) -> int:
    """JS Math.round 와 같은 반올림(양수 기준 .5 올림). 프런트엔드 집계와 값이 일치해야 한다."""
    return int(x + 0.5)


def median(values: list[int]) -> int | None:
    if not values:
        return None
    s = sorted(values)
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else js_round((s[mid - 1] + s[mid]) / 2)


def area_group(area: float) -> int:
    return js_round(area)


def month_stats(trades_by_ym: dict[str, list[dict]]) -> list[dict]:
    out = []
    for ym in sorted(trades_by_ym):
        trades = trades_by_ym[ym]
        act = [t for t in trades if is_active(t)]
        out.append({
            "ym": ym,
            "count": len(act),
            "cancelled": sum(1 for t in trades if t.get("cancelled")),
            "median": median([t["price"] for t in act]),
        })
    return out


def dong_stats(trades: list[dict], from_ym: str, to_ym: str) -> dict:
    by: dict[str, list[int]] = defaultdict(list)
    for t in trades:
        if is_active(t) and from_ym <= t["dealDate"][:7] <= to_ym:
            by[t["umdNm"]].append(t["price"])
    rows = [{"umdNm": k, "count": len(v), "median": median(v)} for k, v in by.items()]
    rows.sort(key=lambda r: (-r["count"], r["umdNm"]))
    return {"fromYm": from_ym, "toYm": to_ym, "rows": rows}


def recent_trades(trades: list[dict], limit: int = 30) -> list[dict]:
    """계약일 최신순. 최근 조회에서 확인되지 않은 거래는 제외, 해제 거래는 표시(구분)용으로 포함."""
    visible = [t for t in trades if not t.get("missingSince")]
    visible.sort(key=lambda t: (t["dealDate"], t["price"]), reverse=True)
    return visible[:limit]


def build_complexes(trades: list[dict], geocache: dict, kapt_by_complex: dict) -> list[dict]:
    """전체 거래에서 단지 목록을 만든다. 좌표·K-apt 정보는 캐시에 확인된 값만 넣는다(없으면 null)."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        groups[t["complexId"]].append(t)

    out = []
    for cid, lst in groups.items():
        lst.sort(key=lambda t: t["dealDate"], reverse=True)
        act = [t for t in lst if is_active(t)]
        head = lst[0]
        years = Counter(t["buildYear"] for t in lst if t.get("buildYear"))
        geo = geocache.get(cid) or {}
        kapt = kapt_by_complex.get(cid)
        last = act[0] if act else None
        out.append({
            "id": cid,
            "name": head["aptNm"],
            "umdNm": head["umdNm"],
            "jibun": head.get("jibun"),
            "roadAddress": (kapt or {}).get("roadAddress"),
            "address": " ".join(x for x in ("순천시", head["umdNm"], head.get("jibun")) if x),
            "buildYear": years.most_common(1)[0][0] if years else None,
            "lat": geo.get("lat"),
            "lng": geo.get("lng"),
            "coordSource": geo.get("source") if geo.get("lat") is not None else None,
            "areas": sorted({area_group(t["area"]) for t in act}),
            "tradeCount": len(act),
            "cancelledCount": sum(1 for t in lst if t.get("cancelled")),
            "lastDealDate": last["dealDate"] if last else None,
            "lastPrice": last["price"] if last else None,
            "lastArea": last["area"] if last else None,
            "lastFloor": last["floor"] if last else None,
            "kapt": {k: v for k, v in kapt.items() if k != "roadAddress"} if kapt else None,
        })
    out.sort(key=lambda c: (-c["tradeCount"], c["name"]))
    return out
