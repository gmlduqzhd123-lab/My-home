"""청약 알림: 청약홈 분양 공고와 LH 공고를 하나의 알림 목록으로 묶고, 캘린더(iCalendar) 파일을 만든다.

서버가 없으므로 알림은 세 경로로 전달된다.
- alerts.json: 앱이 "마지막 방문 이후 새 공고"를 계산하는 데 쓴다(공고별 최초 확인 시각 포함).
- presales.ics: 캘린더 앱이 구독해 일정 알림을 띄운다.
- newIds: 이번 수집에서 처음 확인된 공고. 워크플로가 저장소 이슈(메일 알림)를 만드는 데 쓴다.
"""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta, timezone

CAL_NAME = "순천집 ZIP 청약 일정"


def _item_from_presale(p: dict) -> dict:
    return {
        "id": f"apt-{p['id']}",
        "kind": "청약홈 분양",
        "title": p["name"],
        "location": p.get("location"),
        "announceDate": p.get("announceDate"),
        "receiptStart": p.get("receiptStart"),
        "receiptEnd": p.get("receiptEnd"),
        "winnerDate": p.get("winnerDate"),
        "contractStart": p.get("contractStart"),
        "contractEnd": p.get("contractEnd"),
        "households": p.get("households"),
        "url": p.get("url"),
    }


def _item_from_lh(n: dict) -> dict:
    return {
        "id": f"lh-{n['id']}",
        "kind": "LH " + (n.get("kind") or "공고"),
        "title": n["title"],
        "location": None,
        "announceDate": n.get("date"),
        # LH 목록 자료에는 접수 시작일이 없다. 공고 마감일만 일정으로 쓴다.
        "receiptStart": None,
        "receiptEnd": n.get("closeDate"),
        "winnerDate": None,
        "contractStart": None,
        "contractEnd": None,
        "households": None,
        "url": n.get("url"),
    }


def build(presales: list[dict], lh_notices: list[dict], previous: dict | None, now_iso: str, *,
          presale_status: str, lh_status: str) -> dict:
    """알림 목록. 이전 목록에 있던 공고는 최초 확인 시각을 유지하고, 새 공고만 newIds 에 담는다.

    첫 정상 수집 때는 이미 있던 공고를 한꺼번에 '새 공고'로 알리지 않도록 newIds 를 비운다.
    조회에 실패한 출처의 공고는 이전 목록에서 그대로 유지한다(실패했다고 사라진 것으로 보지 않는다).
    """
    prev_items = {i["id"]: i for i in (previous or {}).get("items", [])}
    # 공고가 한 번이라도 정상 수집된 적이 있어야 그 뒤의 공고를 '새 공고'로 본다
    # (대기·실패 상태만 있던 뒤의 첫 정상 수집에서 기존 공고를 한꺼번에 알리지 않기 위해)
    initial = not (previous or {}).get("primed")
    current: dict[str, dict] = {}
    if presale_status == "ok":
        current.update({i["id"]: i for i in map(_item_from_presale, presales)})
    else:
        current.update({k: v for k, v in prev_items.items() if k.startswith("apt-")})
    if lh_status == "ok":
        current.update({i["id"]: i for i in map(_item_from_lh, lh_notices)})
    else:
        current.update({k: v for k, v in prev_items.items() if k.startswith("lh-")})

    items, new_ids = [], []
    for iid, item in current.items():
        first = (prev_items.get(iid) or {}).get("firstSeenAt")
        if not first:
            first = now_iso
            if not initial:
                new_ids.append(iid)
        items.append({**item, "firstSeenAt": first})
    items.sort(key=lambda i: (i.get("announceDate") or "", i["id"]), reverse=True)

    statuses = {presale_status, lh_status}
    status = "ok" if "ok" in statuses else "failed" if "failed" in statuses else "pending"
    return {"status": status, "generatedAt": now_iso, "sources": {"presale": presale_status, "lh": lh_status},
            "primed": bool((previous or {}).get("primed")) or status == "ok",
            "items": items, "newIds": sorted(new_ids)}


# ───────────────────────── iCalendar ─────────────────────────

def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545: 한 줄은 75옥텟 이하. 넘으면 CRLF + 공백으로 접는다(멀티바이트 문자를 자르지 않게 글자 단위로)."""
    out, cur, size = [], "", 0
    for ch in line:
        b = len(ch.encode("utf-8"))
        if size + b > 73:
            out.append(cur)
            cur, size = " ", 1
        cur += ch
        size += b
    out.append(cur)
    return "\r\n".join(out)


def _ymd(iso: str) -> str:
    return iso.replace("-", "")


def _event(uid: str, summary: str, start: str, end: str | None, description: str, url: str | None,
           stamp: str, alarm: bool) -> list[str]:
    """종일 일정. end 는 포함 날짜(iCalendar 의 DTEND 는 다음 날이어야 한다)."""
    last = date.fromisoformat(end or start)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@suncheon-zip",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{_ymd(start)}",
        f"DTEND;VALUE=DATE:{(last + timedelta(days=1)).strftime('%Y%m%d')}",
        f"SUMMARY:{_esc(summary)}",
        f"DESCRIPTION:{_esc(description)}",
        "TRANSP:TRANSPARENT",
    ]
    if url:
        lines.append(f"URL:{url}")
    if alarm:  # 전날 오전 9시(종일 일정 시작 15시간 전)
        lines += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{_esc(summary)}", "TRIGGER:-PT15H", "END:VALARM"]
    lines.append("END:VEVENT")
    return lines


def build_ics(items: list[dict], now: datetime, *, keep_days: int = 60) -> str:
    """청약 접수·당첨자 발표·계약, LH 공고 마감 일정. 끝난 지 keep_days 일이 지난 일정은 넣지 않는다."""
    stamp = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    cutoff = (now.date() - timedelta(days=keep_days)).isoformat()
    note = "순천집 ZIP 이 공공데이터에서 가져온 일정입니다. 자격·일정은 반드시 공고 원문으로 확인하세요."
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//suncheon-zip//presales//KO", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", f"X-WR-CALNAME:{_esc(CAL_NAME)}", "X-WR-TIMEZONE:Asia/Seoul",
             "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"]
    for i in items:
        key = hashlib.sha1(i["id"].encode("utf-8")).hexdigest()[:16]
        where = f"\n위치: {i['location']}" if i.get("location") else ""
        desc = f"{i['kind']}{where}\n{note}" + (f"\n공고: {i['url']}" if i.get("url") else "")
        plans = []
        if i.get("receiptStart"):
            plans.append(("receipt", f"[청약 접수] {i['title']}", i["receiptStart"], i.get("receiptEnd"), True))
        elif i.get("receiptEnd"):
            plans.append(("close", f"[공고 마감] {i['title']}", i["receiptEnd"], None, True))
        if i.get("winnerDate"):
            plans.append(("winner", f"[당첨자 발표] {i['title']}", i["winnerDate"], None, True))
        if i.get("contractStart"):
            plans.append(("contract", f"[계약] {i['title']}", i["contractStart"], i.get("contractEnd"), False))
        for tag, summary, start, end, alarm in plans:
            if (end or start) < cutoff:
                continue
            lines += _event(f"{key}-{tag}", summary, start, end, desc, i.get("url"), stamp, alarm)
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
