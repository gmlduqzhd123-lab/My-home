import unittest
import urllib.error

from collector import molit
from collector.http import ApiError, http_get, mask, normalize_service_key
from collector.normalize import (assign_ids, complex_id, normalize_items, normalize_name, normalize_trade,
                                 parse_amount, parse_deal_date, parse_short_date)
from tests.helpers import item, xml_response


class ParseResponseTest(unittest.TestCase):
    def test_parses_items_and_total(self):
        items, total = molit.parse_response(xml_response([item(), item(apt="다른단지")]))
        self.assertEqual(total, 2)
        self.assertEqual(items[0]["aptNm"], "테스트단지")
        self.assertEqual(items[1]["dealAmount"], "32,500")

    def test_empty_result_is_ok(self):
        self.assertEqual(molit.parse_response(xml_response([])), ([], 0))

    def test_error_result_code(self):
        with self.assertRaises(ApiError):
            molit.parse_response(xml_response([], code="99", msg="APPLICATION ERROR"))

    def test_gateway_auth_error(self):
        xml = (b"<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
               b"<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
               b"<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>")
        with self.assertRaises(ApiError) as cm:
            molit.parse_response(xml)
        self.assertTrue(cm.exception.auth)

    def test_broken_xml(self):
        with self.assertRaises(ApiError):
            molit.parse_response(b"<response><header>")

    def test_fetch_month_paginates(self):
        pages = {1: xml_response([item(d=1), item(d=2)], total=3), 2: xml_response([item(d=3)], total=3)}
        calls = []

        def fetch(url, params):
            calls.append(params)
            return pages[params["pageNo"]]

        items = molit.fetch_month("KEY", "12150", "2026-10", fetch=fetch, page_size=2)
        self.assertEqual(len(items), 3)
        self.assertEqual(calls[0]["DEAL_YMD"], "202610")
        self.assertEqual(calls[0]["LAWD_CD"], "12150")

    def test_fetch_month_count_mismatch_fails(self):
        with self.assertRaises(ApiError):
            molit.fetch_month("KEY", "12150", "2026-10", fetch=lambda u, p: xml_response([item()], total=5) if p["pageNo"] == 1 else xml_response([], total=5))


class NormalizeTest(unittest.TestCase):
    def test_amount(self):
        self.assertEqual(parse_amount(" 32,500"), 32500)
        self.assertEqual(parse_amount("125,000"), 125000)
        for bad in ("", "abc", "0", None, "-100"):
            with self.assertRaises(ValueError):
                parse_amount(bad)

    def test_deal_date(self):
        self.assertEqual(parse_deal_date("2026", "3", "9"), "2026-03-09")
        with self.assertRaises(ValueError):
            parse_deal_date("2026", "2", "30")
        with self.assertRaises(ValueError):
            parse_deal_date("2026", "", "1")

    def test_short_date(self):
        self.assertEqual(parse_short_date("26.03.14"), "2026-03-14")
        self.assertEqual(parse_short_date("2026-03-14"), "2026-03-14")
        self.assertEqual(parse_short_date("20260314"), "2026-03-14")
        self.assertIsNone(parse_short_date(" "))
        self.assertIsNone(parse_short_date("미정"))

    def test_name_and_complex_id(self):
        self.assertEqual(normalize_name("  왕지  롯데캐슬 "), "왕지 롯데캐슬")
        # 띄어쓰기만 다른 단지명은 같은 단지, 시군구코드와 무관
        self.assertEqual(complex_id("왕지동", "100", "왕지 롯데캐슬"), complex_id("왕지동", "100", "왕지롯데캐슬"))
        self.assertNotEqual(complex_id("왕지동", "100", "가"), complex_id("조례동", "100", "가"))

    def test_normalize_trade_fields(self):
        t = normalize_trade(item(amount=" 41,000", area="84.9712", floor="12", cdealType="O", cdealDay="26.10.20",
                                 dealingGbn="직거래", rgstDate="26.11.01", aptDong="101"))
        self.assertEqual(t["price"], 41000)
        self.assertEqual(t["area"], 84.97)
        self.assertEqual(t["floor"], 12)
        self.assertTrue(t["cancelled"])
        self.assertEqual(t["cancelDate"], "2026-10-20")
        self.assertEqual(t["dealType"], "직거래")
        self.assertEqual(t["rgstDate"], "2026-11-01")
        self.assertFalse(t["landLease"])

    def test_missing_optional_values(self):
        t = normalize_trade(item(floor="", buildYear="", jibun=" ", dealingGbn="", landLeaseholdGbn="", roadNm=""))
        self.assertIsNone(t["floor"])
        self.assertIsNone(t["buildYear"])
        self.assertIsNone(t["jibun"])
        self.assertIsNone(t["dealType"])
        self.assertIsNone(t["landLease"])
        self.assertFalse(t["cancelled"])

    def test_missing_required_rejected(self):
        ok, rejected = normalize_items([item(), item(apt=""), item(amount="미상"), item(area="")])
        self.assertEqual(len(ok), 1)
        self.assertEqual(len(rejected), 3)

    def test_dedupe_across_region_codes(self):
        a, _ = normalize_items([item(d=1), item(d=2)])
        b, _ = normalize_items([item(d=1), item(d=2), item(d=3)])  # 다른 코드 조회에 같은 거래가 다시 나옴
        out = assign_ids([a, b])
        self.assertEqual(len(out), 3)
        self.assertEqual(len({t["id"] for t in out}), 3)

    def test_identical_trades_in_one_response_are_kept(self):
        a, _ = normalize_items([item(), item()])  # 같은 날 같은 조건 2건
        out = assign_ids([a])
        self.assertEqual(sorted(t["id"][-2:] for t in out), ["-0", "-1"])


class HttpTest(unittest.TestCase):
    def test_service_key_forms(self):
        self.assertEqual(normalize_service_key("ab%2Bcd%3D%3D"), "ab+cd==")
        self.assertEqual(normalize_service_key(" ab+cd== "), "ab+cd==")

    def test_mask(self):
        self.assertNotIn("ab+cd==", mask("x?serviceKey=ab%2Bcd%3D%3D ab+cd==", ["ab+cd=="]))

    def test_retries_then_fails_without_leaking_key(self):
        calls = []

        def opener(req, timeout):
            calls.append(req.full_url)
            raise urllib.error.URLError("down serviceKey=SECRET")

        with self.assertRaises(ApiError) as cm:
            http_get("https://example.invalid/x", {"serviceKey": "SECRET"}, secrets=["SECRET"], opener=opener, sleep=lambda s: None)
        self.assertEqual(len(calls), 3)
        self.assertNotIn("SECRET", str(cm.exception))

    def test_auth_error_not_retried(self):
        calls = []

        def opener(req, timeout):
            calls.append(1)
            raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

        with self.assertRaises(ApiError) as cm:
            http_get("https://example.invalid/x", opener=opener, sleep=lambda s: None)
        self.assertTrue(cm.exception.auth)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
