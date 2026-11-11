"""생성 JSON 스키마 검증. 실패하면 정상 데이터 파일을 덮어쓰지 않는다."""
from __future__ import annotations

import re

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
YM = re.compile(r"^\d{4}-\d{2}$")


class ValidationError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems[:10]) + (f" 외 {len(problems) - 10}건" if len(problems) > 10 else ""))
        self.problems = problems


def _opt(v, typ) -> bool:
    return v is None or (isinstance(v, typ) and not isinstance(v, bool) if typ is not bool else isinstance(v, bool))


def trade_problems(t: dict) -> list[str]:
    p: list[str] = []
    tid = t.get("id", "?")

    def bad(msg: str) -> None:
        p.append(f"거래 {tid}: {msg}")

    for k in ("id", "complexId", "aptNm", "umdNm", "firstSeenAt"):
        if not isinstance(t.get(k), str) or not t.get(k):
            bad(f"{k} 누락")
    if not isinstance(t.get("dealDate"), str) or not DATE.match(t.get("dealDate", "")):
        bad("dealDate 형식")
    if not isinstance(t.get("price"), int) or isinstance(t.get("price"), bool) or t.get("price", 0) <= 0:
        bad("price 는 양의 정수(만원)")
    elif t["price"] > 5_000_000:
        bad("price 가 비정상적으로 큼")
    if not isinstance(t.get("area"), (int, float)) or isinstance(t.get("area"), bool) or not 5 <= t.get("area", 0) <= 500:
        bad("area 범위")
    if not _opt(t.get("floor"), int):
        bad("floor 형식")
    if not _opt(t.get("buildYear"), int):
        bad("buildYear 형식")
    if not isinstance(t.get("cancelled"), bool):
        bad("cancelled 형식")
    for k in ("cancelDate", "rgstDate"):
        if t.get(k) is not None and not DATE.match(str(t[k])):
            bad(f"{k} 형식")
    return p


def validate_month(f: dict) -> None:
    p: list[str] = []
    ym = f.get("ym", "")
    if not YM.match(ym):
        p.append("ym 형식")
    if not f.get("fetchedAt") or not f.get("source"):
        p.append(f"{ym}: fetchedAt/source 누락")
    ids: set[str] = set()
    for t in f.get("trades", []):
        p += trade_problems(t)
        if t.get("id") in ids:
            p.append(f"{ym}: 중복 id {t.get('id')}")
        ids.add(t.get("id"))
        if str(t.get("dealDate", ""))[:7] != ym:
            p.append(f"{ym}: 다른 달의 거래 {t.get('id')}")
    if p:
        raise ValidationError(p)


def validate_rent_month(f: dict) -> None:
    p: list[str] = []
    ym = f.get("ym", "")
    if not YM.match(ym) or not f.get("fetchedAt") or not f.get("source"):
        p.append(f"전월세 {ym}: ym/fetchedAt/source")
    ids: set[str] = set()
    for t in f.get("rents", []):
        tid = t.get("id", "?")
        if not all(isinstance(t.get(k), str) and t.get(k) for k in ("id", "complexId", "aptNm", "umdNm", "firstSeenAt")):
            p.append(f"전월세 {tid}: 필수값 누락")
        if not DATE.match(str(t.get("dealDate"))) or str(t.get("dealDate"))[:7] != ym:
            p.append(f"전월세 {tid}: dealDate")
        for k in ("deposit", "monthly"):
            v = t.get(k)
            if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 5_000_000:
                p.append(f"전월세 {tid}: {k}")
        if not isinstance(t.get("area"), (int, float)) or not 5 <= t.get("area", 0) <= 500:
            p.append(f"전월세 {tid}: area")
        if tid in ids:
            p.append(f"전월세 {ym}: 중복 id {tid}")
        ids.add(tid)
    if p:
        raise ValidationError(p)


def validate_manifest(m: dict, month_counts: dict[str, int]) -> None:
    p: list[str] = []
    if m.get("status") not in ("ok", "pending"):
        p.append("manifest.status")
    if m.get("status") == "ok" and not m.get("generatedAt"):
        p.append("manifest.generatedAt 누락")
    yms = [x.get("ym") for x in m.get("months", [])]
    if len(yms) != len(set(yms)):
        p.append("manifest.months 중복")
    for x in m.get("months", []):
        if not YM.match(str(x.get("ym"))):
            p.append(f"manifest.months ym 형식: {x.get('ym')}")
        elif month_counts.get(x["ym"]) != x.get("count"):
            p.append(f"manifest.months[{x['ym']}].count 불일치")
    if p:
        raise ValidationError(p)


def validate_complexes(complexes: list[dict], trade_complex_ids: set[str]) -> None:
    p: list[str] = []
    ids = set()
    for c in complexes:
        cid = c.get("id")
        if not cid or not c.get("name") or not c.get("umdNm"):
            p.append(f"단지 {cid}: 필수값 누락")
        if cid in ids:
            p.append(f"단지 중복 {cid}")
        ids.add(cid)
        lat, lng = c.get("lat"), c.get("lng")
        if (lat is None) != (lng is None):
            p.append(f"단지 {cid}: 좌표 한쪽만 있음")
        # 대한민국 범위를 벗어난 좌표는 잘못된 지오코딩으로 본다
        if lat is not None and not (33 <= lat <= 39 and 124 <= lng <= 132):
            p.append(f"단지 {cid}: 좌표 범위 오류")
    missing = trade_complex_ids - ids
    if missing:
        p.append(f"거래에는 있으나 단지 목록에 없는 단지 {len(missing)}개")
    if p:
        raise ValidationError(p)


def validate_briefing(b: dict) -> None:
    p: list[str] = []
    if not DATE.match(str(b.get("date"))):
        p.append("briefing.date")
    if b.get("status") not in ("ok", "no_new", "failed", "initial", "pending"):
        p.append("briefing.status")
    if not isinstance(b.get("headlines"), list) or not b.get("headlines"):
        p.append("briefing.headlines")
    for t in b.get("newTrades", []) + b.get("newCancellations", []):
        p += trade_problems(t)
    if p:
        raise ValidationError(p)
