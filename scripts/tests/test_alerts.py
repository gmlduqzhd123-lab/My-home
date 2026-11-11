import sys
import unittest
from datetime import datetime
from pathlib import Path

from collector import alerts, config

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import notify_new  # noqa: E402

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=config.KST)
T1, T2 = "2026-11-10T08:00:00+09:00", "2026-11-11T08:00:00+09:00"

PRESALE = {"id": "2026000111-1", "name": "순천 테스트 분양단지, A블록", "location": "순천시 왕지동 1", "households": 512,
           "announceDate": "2026-11-05", "receiptStart": "2026-11-17", "receiptEnd": "2026-11-19", "winnerDate": "2026-11-26",
           "contractStart": "2026-12-07", "contractEnd": "2026-12-09", "url": "https://www.applyhome.co.kr/x"}
LH = {"id": "0000061111", "title": "순천신대 행복주택 입주자 모집", "kind": "임대주택 · 행복주택", "date": "2026-10-20",
      "closeDate": "2026-11-20", "url": "https://apply.lh.or.kr/x"}


class BuildTest(unittest.TestCase):
    def test_first_build_does_not_flood(self):
        a = alerts.build([PRESALE], [LH], None, T1, presale_status="ok", lh_status="ok")
        self.assertEqual(a["newIds"], [])  # 이미 있던 공고를 한꺼번에 새 공고로 알리지 않는다
        self.assertEqual([i["id"] for i in a["items"]], ["apt-2026000111-1", "lh-0000061111"])
        self.assertEqual(a["items"][1]["receiptEnd"], "2026-11-20")
        self.assertEqual(a["status"], "ok")

    def test_only_unseen_items_are_new(self):
        first = alerts.build([PRESALE], [], None, T1, presale_status="ok", lh_status="ok")
        second = alerts.build([PRESALE], [LH], first, T2, presale_status="ok", lh_status="ok")
        self.assertEqual(second["newIds"], ["lh-0000061111"])
        by = {i["id"]: i["firstSeenAt"] for i in second["items"]}
        self.assertEqual(by, {"apt-2026000111-1": T1, "lh-0000061111": T2})  # 기존 공고의 최초 확인 시각 유지
        third = alerts.build([PRESALE], [LH], second, "2026-11-12T08:00:00+09:00", presale_status="ok", lh_status="ok")
        self.assertEqual(third["newIds"], [])

    def test_first_success_after_pending_or_failed_does_not_flood(self):
        pending = {"status": "pending", "items": [], "newIds": []}  # 초기 파일
        failed = alerts.build([], [], pending, T1, presale_status="failed", lh_status="failed")
        self.assertFalse(failed["primed"])
        ok = alerts.build([PRESALE], [LH], failed, T2, presale_status="ok", lh_status="ok")
        self.assertEqual(ok["newIds"], [])  # 첫 정상 수집
        self.assertTrue(ok["primed"])
        later = alerts.build([PRESALE, {**PRESALE, "id": "2026000222-1", "name": "새 단지"}], [LH], ok, "2026-11-12T08:00:00+09:00",
                             presale_status="ok", lh_status="ok")
        self.assertEqual(later["newIds"], ["apt-2026000222-1"])

    def test_failed_source_keeps_its_previous_items(self):
        first = alerts.build([PRESALE], [LH], None, T1, presale_status="ok", lh_status="ok")
        second = alerts.build([], [LH], first, T2, presale_status="failed", lh_status="ok")
        self.assertEqual(len(second["items"]), 2)  # 조회 실패를 공고 삭제로 보지 않는다
        self.assertEqual(second["newIds"], [])
        self.assertEqual(alerts.build([], [], None, T1, presale_status="pending", lh_status="pending")["status"], "pending")
        self.assertEqual(alerts.build([], [], None, T1, presale_status="failed", lh_status="pending")["status"], "failed")


class IcsTest(unittest.TestCase):
    def setUp(self):
        self.items = alerts.build([PRESALE], [LH], None, T1, presale_status="ok", lh_status="ok")["items"]
        self.ics = alerts.build_ics(self.items, NOW)

    def test_structure(self):
        self.assertTrue(self.ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"))
        self.assertTrue(self.ics.endswith("END:VCALENDAR\r\n"))
        self.assertEqual(self.ics.count("BEGIN:VEVENT"), 4)  # 접수·발표·계약 + LH 마감
        self.assertEqual(self.ics.count("BEGIN:VEVENT"), self.ics.count("END:VEVENT"))
        self.assertEqual(self.ics.count("BEGIN:VALARM"), 3)  # 계약 일정에는 알림을 달지 않는다
        for line in self.ics.split("\r\n"):
            self.assertLessEqual(len(line.encode("utf-8")), 75)

    def test_dates_and_escaping(self):
        unfolded = self.ics.replace("\r\n ", "")
        self.assertIn("DTSTART;VALUE=DATE:20261117\r\nDTEND;VALUE=DATE:20261120", unfolded)  # 종료일은 다음 날
        self.assertIn("SUMMARY:[청약 접수] 순천 테스트 분양단지\\, A블록", unfolded)  # 쉼표 이스케이프
        self.assertIn("SUMMARY:[공고 마감] 순천신대 행복주택 입주자 모집", unfolded)
        self.assertIn("DTSTAMP:20261110T230000Z", unfolded)  # UTC

    def test_stable_uids_and_old_events_dropped(self):
        uids = lambda s: sorted(l for l in s.replace("\r\n ", "").split("\r\n") if l.startswith("UID:"))  # noqa: E731
        self.assertEqual(uids(self.ics), uids(alerts.build_ics(self.items, NOW)))  # 캘린더에서 중복되지 않게 고정
        later = datetime(2027, 6, 1, 8, 0, tzinfo=config.KST)
        self.assertEqual(alerts.build_ics(self.items, later).count("BEGIN:VEVENT"), 0)


class NotifyTest(unittest.TestCase):
    def test_issue_body(self):
        first = alerts.build([PRESALE], [], None, T1, presale_status="ok", lh_status="ok")
        self.assertEqual(notify_new.render(first), "")  # 새 공고가 없으면 이슈를 만들지 않는다
        second = alerts.build([PRESALE], [LH], first, T2, presale_status="ok", lh_status="ok")
        text = notify_new.render(second, "https://example.github.io/app/")
        lines = text.splitlines()
        self.assertEqual(lines[0], "새 청약 공고 1건 (2026-11-11)")
        self.assertIn("### 순천신대 행복주택 입주자 모집", lines)
        self.assertIn("- 공고 마감: 2026-11-20", lines)
        self.assertIn("청약 알림 화면: https://example.github.io/app/#/alerts", lines)
        self.assertNotIn("순천 테스트 분양단지", text)


if __name__ == "__main__":
    unittest.main()
