"""규칙 기반 일별 브리핑 생성 (AI API 불필요)."""
from __future__ import annotations

from collections import Counter

from . import config
from .merge import Diff, find_corrections, is_active
from .stats import median

MAX_LIST = 100

CHECKLIST = [
    "실거래가는 과거에 체결된 계약 금액입니다. 현재 매물 호가와 다르며 같은 금액으로 살 수 있다는 뜻이 아닙니다.",
    "같은 단지라도 전용면적·층·동·향·수리 상태에 따라 금액이 달라집니다. 같은 면적의 이전 거래와 비교하세요.",
    "매매 계약은 체결 후 30일 이내에 신고되므로 최근 계약은 아직 자료에 없을 수 있습니다.",
    "해제(취소)된 거래와 직거래는 시세 판단에서 따로 살펴보세요.",
    "계약 전 등기사항증명서·건축물대장으로 권리관계와 면적을 직접 확인하세요.",
    "대출 한도·금리·세금은 개인 조건에 따라 달라집니다. 금융기관과 세무 전문가에게 확인하세요.",
]

SOURCES = [
    {"name": "국토교통부 아파트 매매 실거래가 상세 자료 (공공데이터포털)", "url": config.MOLIT_TRADE_PAGE},
    {"name": "국토교통부 실거래가 공개시스템", "url": "https://rt.molit.go.kr/"},
    {"name": "한국부동산원 청약홈", "url": "https://www.applyhome.co.kr/"},
]


def fmt_price(manwon: int) -> str:
    eok, rest = divmod(manwon, 10000)
    if eok == 0:
        return f"{rest:,}만원"
    return f"{eok:,}억원" if rest == 0 else f"{eok:,}억 {rest:,}만원"


def _by_date_desc(trades: list[dict]) -> list[dict]:
    return sorted(trades, key=lambda t: (t["dealDate"], t["price"]), reverse=True)


def _union(a: list[dict], b: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for t in [*a, *b]:
        seen[t["id"]] = t
    return list(seen.values())


def zone_rows(new_active: list[dict], zones: list[dict]) -> list[dict]:
    rows = []
    for z in zones:
        hit = [t for t in new_active if any(m in t["umdNm"] for m in z["match"])]
        rows.append({"zoneId": z["id"], "name": z["name"], "newCount": len(hit),
                     "median": median([t["price"] for t in hit])})
    return rows


def headlines(status: str, new_active: list[dict], cancelled: list[dict], corrections: list[dict],
              total_stored: int) -> list[str]:
    if status == "initial":
        return [
            f"첫 수집을 완료했습니다. 순천시 아파트 매매 거래 {total_stored:,}건을 확인했습니다.",
            "첫 수집에서는 '새로 확인된 거래'를 구분할 수 없습니다. 다음 갱신부터 변경분을 안내합니다.",
            "전체 거래는 실거래 메뉴에서 기간·지역·면적별로 조회할 수 있습니다.",
        ]
    if status == "no_new":
        return ["이전 확인 이후 새로 확인된 거래가 없습니다.",
                "해제·정정으로 확인된 변경도 없습니다.",
                "매매 계약은 체결 후 30일 이내에 신고되므로 최근 계약은 이후에 추가될 수 있습니다."]
    lines = []
    if new_active:
        dates = sorted(t["dealDate"] for t in new_active)
        lines.append(f"새로 확인된 매매 거래는 {len(new_active):,}건입니다 (계약일 {dates[0]} ~ {dates[-1]}).")
        top = max(new_active, key=lambda t: t["price"])
        lines.append(f"이 가운데 가장 높은 금액은 {top['umdNm']} {top['aptNm']} 전용 {top['area']:g}㎡ "
                     f"{top['floor'] if top['floor'] is not None else '-'}층 {fmt_price(top['price'])}입니다.")
        dong, n = Counter(t["umdNm"] for t in new_active).most_common(1)[0]
        tail = f"거래가 가장 많이 확인된 법정동은 {dong}({n}건)입니다."
    else:
        lines.append("새로 확인된 매매 거래는 없습니다.")
        tail = "매매 계약은 체결 후 30일 이내에 신고되므로 최근 계약은 이후에 추가될 수 있습니다."
    if cancelled or corrections:
        lines.append(f"해제로 확인된 거래 {len(cancelled)}건, 정정으로 추정되는 변경 {len(corrections)}건이 있습니다.")
    lines.append(tail)
    return lines[:3]


def build(
    *,
    date: str,
    now_iso: str,
    diff: Diff,
    initial: bool,
    total_stored: int,
    previous_date: str | None,
    same_day: dict | None,
    presales: list[dict],
    zones: list[dict],
    message: str | None = None,
) -> dict:
    """정상 수집 후 브리핑. same_day: 같은 날 앞서 만든 브리핑(있으면 변경분을 합친다)."""
    new = [t for t in diff.new if not t.get("cancelled")]
    cancelled = list(diff.cancelled)
    corrections = find_corrections(diff)
    if same_day and same_day.get("status") in ("ok", "no_new") and not initial:
        new = _union(same_day.get("newTrades", []), new)
        cancelled = _union(same_day.get("newCancellations", []), cancelled)
        corrections = same_day.get("corrections", []) + corrections
    if same_day and same_day.get("status") == "initial":
        initial = True  # 첫 수집 당일의 재실행도 첫 수집으로 안내

    new_active = [t for t in new if is_active(t)]
    if initial:
        status, new, cancelled, corrections, new_active = "initial", [], [], [], []
    elif new_active or cancelled or corrections:
        status = "ok"
    else:
        status = "no_new"

    return {
        "date": date,
        "generatedAt": now_iso,
        "status": status,
        "message": message,
        "previousDate": previous_date,
        "headlines": headlines(status, new_active, cancelled, corrections, total_stored),
        "newTrades": _by_date_desc(new_active)[:MAX_LIST],
        "newTradesTotal": len(new_active),
        "newCancellations": _by_date_desc(cancelled)[:MAX_LIST],
        "corrections": corrections[:MAX_LIST],
        "zones": zone_rows(new_active, zones),
        "presales": presales[:5],
        "checklist": CHECKLIST,
        "sources": SOURCES,
    }


def build_failed(*, date: str, now_iso: str, message: str, previous_date: str | None) -> dict:
    """조회 실패 브리핑. '새 거래 없음'과 구분한다."""
    return {
        "date": date,
        "generatedAt": now_iso,
        "status": "failed",
        "message": message,
        "previousDate": previous_date,
        "headlines": ["오늘은 공공데이터 조회에 실패해 새 거래를 확인하지 못했습니다.",
                      "새로 확인된 거래가 없다는 뜻이 아닙니다.",
                      "화면의 거래 자료는 마지막으로 정상 수집된 내용입니다."],
        "newTrades": [],
        "newTradesTotal": 0,
        "newCancellations": [],
        "corrections": [],
        "zones": [],
        "presales": [],
        "checklist": CHECKLIST,
        "sources": SOURCES,
    }


def update_index(index: dict | None, b: dict, keep: int = 120) -> dict:
    items = [i for i in (index or {}).get("items", []) if i["date"] != b["date"]]
    items.append({"date": b["date"], "status": b["status"], "newTradesTotal": b["newTradesTotal"]})
    items.sort(key=lambda i: i["date"], reverse=True)
    return {"items": items[:keep]}
