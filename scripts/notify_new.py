"""이번 수집에서 새로 확인된 청약 공고를 GitHub 이슈 본문으로 출력한다.

워크플로가 이 출력으로 이슈를 만들면 GitHub 가 저장소를 구독(Watch)한 사람에게 메일을 보낸다.
첫 줄은 이슈 제목, 둘째 줄부터 본문. 새 공고가 없으면 아무것도 출력하지 않는다.

사용법: python scripts/notify_new.py [alerts.json 경로] [사이트 주소]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def render(alerts: dict, site_url: str = "") -> str:
    new_ids = set(alerts.get("newIds") or [])
    items = [i for i in alerts.get("items", []) if i["id"] in new_ids]
    if not items:
        return ""
    day = str(alerts.get("generatedAt", ""))[:10]
    lines = [f"새 청약 공고 {len(items)}건 ({day})", ""]
    for i in items:
        lines.append(f"### {i['title']}")
        lines.append(f"- 구분: {i['kind']}")
        if i.get("location"):
            lines.append(f"- 위치: {i['location']}")
        if i.get("announceDate"):
            lines.append(f"- 공고일: {i['announceDate']}")
        if i.get("receiptStart"):
            end = f" ~ {i['receiptEnd']}" if i.get("receiptEnd") and i["receiptEnd"] != i["receiptStart"] else ""
            lines.append(f"- 청약 접수: {i['receiptStart']}{end}")
        elif i.get("receiptEnd"):
            lines.append(f"- 공고 마감: {i['receiptEnd']}")
        if i.get("winnerDate"):
            lines.append(f"- 당첨자 발표: {i['winnerDate']}")
        if i.get("url"):
            lines.append(f"- 공고 원문: {i['url']}")
        lines.append("")
    lines.append("공공데이터에서 자동으로 확인한 내용입니다. 자격·일정은 반드시 공고 원문으로 확인하세요.")
    if site_url:
        lines.append(f"청약 알림 화면: {site_url.rstrip('/')}/#/alerts")
    return "\n".join(lines) + "\n"


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "public" / "data" / "alerts.json")
    site = sys.argv[2] if len(sys.argv) > 2 else ""
    try:
        alerts = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return 0
    sys.stdout.write(render(alerts, site))
    return 0


if __name__ == "__main__":
    sys.exit(main())
