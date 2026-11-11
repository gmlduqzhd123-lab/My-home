"""기존 저장분과 새 조회분 병합: 중복 제거, 해제 반영, 변경 내역(diff) 산출."""
from __future__ import annotations

from dataclasses import dataclass, field

# 사후에 바뀔 수 있어 조회 때마다 갱신하는 필드
MUTABLE = ("cancelled", "cancelDate", "rgstDate", "aptDong", "dealType", "buyer", "seller", "agentLoc", "landLease",
           "roadNm", "buildYear")


@dataclass
class Diff:
    new: list[dict] = field(default_factory=list)  # 처음 확인된 거래
    cancelled: list[dict] = field(default_factory=list)  # 이번에 해제로 바뀐 거래
    missing: list[dict] = field(default_factory=list)  # 이번 조회에서 사라진 거래
    restored: list[dict] = field(default_factory=list)  # 사라졌다가 다시 확인된 거래

    def extend(self, other: "Diff") -> None:
        self.new += other.new
        self.cancelled += other.cancelled
        self.missing += other.missing
        self.restored += other.restored


def merge_month(existing: list[dict], fetched: list[dict], now_iso: str) -> tuple[list[dict], Diff]:
    """한 계약월의 병합.

    - 새 조회에 있는 거래: 기존 firstSeenAt 유지, 사후 변경 필드 갱신.
    - 새 조회에 없는 기존 거래: 삭제하지도, 해제로 간주하지도 않는다.
      missingSince 만 기록한다(정정으로 금액·면적이 바뀌면 기존 건이 이렇게 남는다).
      통계에서는 제외하고 화면에는 '최근 조회 미확인'으로 표시한다.
    """
    old = {t["id"]: t for t in existing}
    diff = Diff()
    merged: list[dict] = []
    seen: set[str] = set()

    for f in fetched:
        if f["id"] in seen:  # 방어: 같은 id 중복 유입
            continue
        seen.add(f["id"])
        prev = old.get(f["id"])
        if prev is None:
            rec = {**f, "firstSeenAt": now_iso, "missingSince": None}
            diff.new.append(rec)
        else:
            rec = {**prev, **{k: f[k] for k in MUTABLE}, "missingSince": None}
            if f["cancelled"] and not prev.get("cancelled"):
                diff.cancelled.append(rec)
            if prev.get("missingSince"):
                diff.restored.append(rec)
        merged.append(rec)

    for tid, prev in old.items():
        if tid in seen:
            continue
        rec = {**prev, "missingSince": prev.get("missingSince") or now_iso}
        if not prev.get("missingSince"):
            diff.missing.append(rec)
        merged.append(rec)

    merged.sort(key=lambda t: (t["dealDate"], t["aptNm"], t["area"], t["id"]), reverse=True)
    return merged, diff


def find_corrections(diff: Diff) -> list[dict]:
    """사라진 거래와 새 거래가 같은 단지·계약일·층이면 '정정 추정'으로 묶는다."""
    out: list[dict] = []
    for m in diff.missing:
        for n in diff.new:
            if (n["complexId"], n["dealDate"], n["floor"]) != (m["complexId"], m["dealDate"], m["floor"]):
                continue
            if n["price"] != m["price"]:
                out.append({"id": n["id"], "aptNm": n["aptNm"], "field": "거래금액",
                            "before": f"{m['price']}", "after": f"{n['price']}"})
            elif n["area"] != m["area"]:
                out.append({"id": n["id"], "aptNm": n["aptNm"], "field": "전용면적",
                            "before": f"{m['area']}", "after": f"{n['area']}"})
            break
    return out


def is_active(t: dict) -> bool:
    """통계 집계 대상: 해제되지 않았고, 최근 조회에서 확인된 거래."""
    return not t.get("cancelled") and not t.get("missingSince")
