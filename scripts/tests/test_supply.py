import io
import json
import unittest
import zipfile
from datetime import datetime

from collector import config, supply
from collector.http import ApiError

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=config.KST)


def hub(rows, total=None):
    items = {"item": rows[0] if len(rows) == 1 else rows} if rows else ""
    return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": items, "totalCount": len(rows) if total is None else total}}}).encode()


class BjdongTest(unittest.TestCase):
    def test_parses_zip_and_filters_sigungu(self):
        text = "법정동코드\t법정동명\t폐지여부\n1215000000\t전남광주통합특별시 순천시\t존재\n1215010300\t전남광주통합특별시 순천시 왕지동\t존재\n1215010400\t전남광주통합특별시 순천시 옛동\t폐지\n1213010100\t전남광주통합특별시 여수시 어느동\t존재\n"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("법정동코드 전체자료.txt", text.encode("cp949"))
        out = supply.fetch_bjdongs(["12150"], get=lambda *a, **k: buf.getvalue())
        self.assertEqual(out, {"10300": "전남광주통합특별시 순천시 왕지동"})  # 시군구 행·폐지·다른 시군 제외
        with self.assertRaises(ApiError):
            supply.fetch_bjdongs(["12150"], get=lambda *a, **k: b"not a zip")


class PermitTest(unittest.TestCase):
    def row(self, pk, **kw):
        return {"mgmHsrgstPk": pk, "platPlc": "전남광주통합특별시 순천시 왕지동 100", "bldNm": "테스트 공급단지", "totHhldCnt": "512",
                "purpsCdNm": "공동주택", "apprvDay": "20260315", "stcnsDay": "", "stcnsSchedDay": "20261201",
                "useInsptDay": "20290101", **kw}

    def test_update_and_select(self):
        calls = []

        def get(url, params, **k):
            calls.append(params["bjdongCd"])
            if params["bjdongCd"] == "10300":
                return hub([self.row("P1"), self.row("P2", totHhldCnt="4"), self.row("P3", apprvDay="20100101"),
                            self.row("P4", platPlc="서울특별시 어딘가 1"), self.row("P5", stcnsDay="20260901")])
            return hub([])

        cache = {}
        supply.update_permits(cache, "K", {"10300": "왕지동", "10400": "조례동"}, NOW, get=get)
        self.assertEqual(sorted(calls), ["10300", "10400"])
        items = supply.permit_items(cache, NOW)
        self.assertEqual([p["id"] for p in items], ["P5", "P1"])  # 소규모·오래된 허가·다른 지역 제외
        self.assertEqual((items[0]["status"], items[1]["status"]), ("착공", "허가"))
        self.assertEqual((items[1]["households"], items[1]["permitDate"], items[1]["startPlanDate"]), (512, "2026-03-15", "2026-12-01"))
        self.assertNotIn("useInsptDay", items[1])  # 신뢰할 수 없는 사용검사일은 싣지 않는다
        calls.clear()
        supply.update_permits(cache, "K", {"10300": "왕지동", "10400": "조례동"}, NOW, get=get)
        self.assertEqual(calls, [])  # 7일 안에는 다시 조회하지 않는다

    def test_incomplete_pages_fail(self):
        with self.assertRaises(ApiError):
            supply.update_permits({}, "K", {"10300": "왕지동"}, NOW,
                                  get=lambda url, params, **k: hub([self.row("P1")], total=250) if params["pageNo"] == 1 else hub([], total=250))

    def test_auth_error(self):
        body = json.dumps({"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"returnAuthMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}).encode()
        with self.assertRaises(ApiError) as cm:
            supply.update_permits({}, "K", {"10300": "왕지동"}, NOW, get=lambda *a, **k: body)
        self.assertTrue(cm.exception.auth)


class BuildingTest(unittest.TestCase):
    codes = {"sigunguCd": "12150", "bjdongCd": "10300", "bun": "0100", "ji": "0000", "landCd": "1"}

    def test_recap_preferred(self):
        seen = {}

        def get(url, params, **k):
            seen.update(params)
            if url == supply.REGISTER_RECAP_URL:
                return hub([{"bun": "0100", "ji": "0000", "hhldCnt": "640", "mainBldCnt": "8", "totPkngCnt": "800", "bcRat": "18.5",
                             "vlRat": "229.97", "useAprDay": "20160315", "bldNm": "테스트단지"},
                            {"bun": "0999", "ji": "0000", "hhldCnt": "9999"}])  # 다른 지번은 무시
            return hub([{"bun": "0100", "ji": "0000", "mainPurpsCdNm": "공동주택", "grndFlrCnt": "20", "ugrndFlrCnt": "2", "hhldCnt": "80"},
                        {"bun": "0100", "ji": "0000", "mainPurpsCdNm": "근린생활시설", "grndFlrCnt": "2"}])

        info = supply.fetch_building("K", self.codes, "T", get=get)
        self.assertEqual(seen["platGbCd"], "0")  # 실거래 대지구분 1(대지) → 건축물대장 0
        self.assertEqual((info["households"], info["dongCount"], info["parking"], info["coverageRatio"], info["floorAreaRatio"]),
                         (640, 8, 800, 18.5, 229.97))
        self.assertEqual((info["topFloor"], info["basementFloors"], info["useDate"], info["basis"]), (20, 2, "2016-03-15", "건축물대장 총괄표제부"))

    def test_title_fallback_and_none(self):
        def get(url, params, **k):
            if url == supply.REGISTER_RECAP_URL:
                return hub([])
            return hub([{"bun": "0100", "ji": "0000", "mainPurpsCdNm": "공동주택", "grndFlrCnt": "15", "hhldCnt": "120",
                         "indrAutoUtcnt": "90", "oudrAutoUtcnt": "40", "useAprDay": "19980520", "vlRat": "0"}])

        info = supply.fetch_building("K", self.codes, "T", get=get)
        self.assertEqual((info["households"], info["dongCount"], info["parking"], info["topFloor"], info["floorAreaRatio"]), (120, 1, 130, 15, None))
        self.assertEqual(info["basis"], "건축물대장 표제부(동별 합산)")
        self.assertIsNone(supply.fetch_building("K", self.codes, "T", get=lambda *a, **k: hub([])))  # 없으면 만들지 않는다


class StatTest(unittest.TestCase):
    def test_unsold(self):
        def get(url, params, **k):
            ok = {"status_code": "INFO-000"}
            if params["start_dt"] == "202609" and params["form_id"] == "2082":
                rows = [{"구분": "전남광주", "시군구": "계", "미분양현황": "3,000", "date": "202609"},
                        {"구분": "전남광주", "시군구": "순천시", "미분양현황": "1,234", "date": "202609"}]
            elif params["start_dt"] == "202609":
                rows = [{"시군구": "순천시", "부문": "민간부문", "규모": "계", "호": "5"},
                        {"시군구": "순천시", "부문": "계", "규모": "계", "호": "210"}]
            else:
                return json.dumps({"result_status": {"status_code": "INFO-200"}}).encode()
            return json.dumps({"result_status": ok, "result_data": {"unitName": "호", "formList": rows}}).encode()

        out = supply.fetch_unsold("K", ["2026-09", "2026-10"], get=get)
        self.assertEqual(out, {"2026-09": {"unsold": 1234, "afterCompletion": 210}})  # 자료 없는 달은 0 이 아니라 빠진다
        with self.assertRaises(ApiError):
            supply.fetch_unsold("K", ["2026-09"], get=lambda *a, **k: json.dumps({"result_status": {"status_code": "ERROR-301"}}).encode())

    def test_population(self):
        rows = [{"C1": "12150", "C1_NM": "순천시", "PRD_DE": "202609", "DT": "276543"},
                {"C1": "12", "C1_NM": "전남광주통합특별시", "PRD_DE": "202609", "DT": "3200000"},
                {"C1": "12150", "C1_NM": "순천시", "PRD_DE": "202608", "DT": "276600"},
                {"C1": "12130", "C1_NM": "여수시", "PRD_DE": "202609", "DT": "268000"}]
        out = supply.fetch_population("K", "2026-08", "2026-09", get=lambda *a, **k: json.dumps(rows).encode())
        self.assertEqual(out, [{"ym": "2026-08", "value": 276600}, {"ym": "2026-09", "value": 276543}])
        self.assertEqual(supply.fetch_population("K", "2026-08", "2026-09", get=lambda *a, **k: b'{"err":"30","errMsg":"no data"}'), [])


if __name__ == "__main__":
    unittest.main()
