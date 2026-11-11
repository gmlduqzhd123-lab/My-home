import json
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from collector import config, enrich, pipeline
from collector.http import ApiError
from collector.merge import Diff, find_corrections, is_active, merge_month
from collector.normalize import assign_ids, normalize_items
from collector.normalize import normalize_rent
from tests.helpers import item, rent_item

NOW1 = datetime(2026, 11, 10, 8, 0, tzinfo=config.KST)
NOW2 = datetime(2026, 11, 11, 8, 0, tzinfo=config.KST)


def trades(items):
    ok, _ = normalize_items(items)
    return assign_ids([ok])


class MergeTest(unittest.TestCase):
    def test_new_cancel_missing_restore(self):
        first, d1 = merge_month([], trades([item(d=1), item(d=2), item(d=3)]), "T1")
        self.assertEqual(len(d1.new), 3)
        self.assertTrue(all(t["firstSeenAt"] == "T1" for t in first))

        # 2일 거래가 해제로 바뀌고, 3일 거래는 응답에서 사라지고, 4일 거래가 새로 나타남
        second, d2 = merge_month(first, trades([item(d=1), item(d=2, cdealType="O", cdealDay="26.10.30"), item(d=4)]), "T2")
        self.assertEqual([t["dealDate"] for t in d2.new], ["2026-10-04"])
        self.assertEqual([t["dealDate"] for t in d2.cancelled], ["2026-10-02"])
        self.assertEqual([t["dealDate"] for t in d2.missing], ["2026-10-03"])
        by_date = {t["dealDate"]: t for t in second}
        self.assertEqual(len(second), 4)  # 사라진 거래도 삭제하지 않는다
        self.assertFalse(by_date["2026-10-03"]["cancelled"])  # 사라졌다고 해제로 간주하지 않는다
        self.assertEqual(by_date["2026-10-03"]["missingSince"], "T2")
        self.assertEqual(by_date["2026-10-01"]["firstSeenAt"], "T1")
        self.assertEqual(sum(1 for t in second if is_active(t)), 2)  # 해제·미확인은 집계 제외

        third, d3 = merge_month(second, trades([item(d=1), item(d=2, cdealType="O", cdealDay="26.10.30"), item(d=3), item(d=4)]), "T3")
        self.assertEqual(len(d3.restored), 1)
        self.assertEqual(len(d3.new), 0)
        self.assertIsNone({t["dealDate"]: t for t in third}["2026-10-03"]["missingSince"])

    def test_same_fetch_twice_adds_nothing(self):
        first, _ = merge_month([], trades([item(d=1), item(d=1)]), "T1")
        second, d = merge_month(first, trades([item(d=1), item(d=1)]), "T2")
        self.assertEqual(len(second), 2)
        self.assertEqual((len(d.new), len(d.cancelled), len(d.missing)), (0, 0, 0))

    def test_correction_detected(self):
        first, _ = merge_month([], trades([item(d=1, amount="30,000")]), "T1")
        _, d = merge_month(first, trades([item(d=1, amount="31,000")]), "T2")
        c = find_corrections(d)
        self.assertEqual(c[0]["field"], "거래금액")
        self.assertEqual((c[0]["before"], c[0]["after"]), ("30000", "31000"))


class FakeApi:
    """월별 응답을 흉내 낸다. 46150(폐지 코드)은 항상 0건."""

    def __init__(self):
        self.data: dict[str, list] = {}
        self.rents: dict[str, list] = {}
        self.error: Exception | None = None
        self.rent_error: Exception | None = None
        self.calls = 0

    def fetch_rent_month(self, key, code, ym):
        if self.rent_error:
            raise self.rent_error
        return list(self.rents.get(ym, [])) if code == "12150" else []

    def fetch_month(self, key, code, ym):
        self.calls += 1
        if self.error:
            raise self.error
        return list(self.data.get(ym, [])) if code == "12150" else []


def no_net(*a, **k):
    raise ApiError("테스트에서는 외부 호출 없음")


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.data, self.cache = self.tmp / "public" / "data", self.tmp / "cache"
        self.api = FakeApi()
        self.api.data = {
            "2026-10": [item(d=d, amount=f"{30000 + d * 100:,}") for d in range(1, 26)],
            "2026-11": [item(apt="테스트단지B", umd="조례동", jibun="200", m=11, d=3, amount="25,000", area="59.9")],
        }
        self.logs: list[str] = []

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_at(self, now, env=None):
        return pipeline.run(now=now, data_dir=self.data, cache_dir=self.cache,
                            env={"MOLIT_API_KEY": "KEY"} if env is None else env,
                            fetch_month=self.api.fetch_month, fetch_rent_month=self.api.fetch_rent_month,
                            get=no_net, log=self.logs.append)

    def read(self, rel):
        return json.loads((self.data / rel).read_text(encoding="utf-8"))

    def snapshot(self):
        return {str(p.relative_to(self.data)): p.read_bytes() for p in self.data.rglob("*.json")
                if p.name != "manifest.json" and "briefing" not in p.parts}

    def test_initial_run_outputs(self):
        self.assertEqual(self.run_at(NOW1), pipeline.EXIT_OK)
        m = self.read("manifest.json")
        self.assertEqual(m["status"], "ok")
        self.assertEqual(m["generatedAt"], NOW1.isoformat())
        self.assertEqual(m["totals"]["trades"], 26)
        self.assertEqual([x["ym"] for x in m["months"]], ["2026-10", "2026-11"])
        self.assertEqual(self.api.calls, 24 * len(config.LAWD_CODES))  # 첫 실행은 24개월 × 지역코드 수
        self.assertEqual(self.read("briefing/latest.json")["status"], "initial")
        month = self.read("trades/2026-10.json")
        self.assertEqual(month["source"], config.SOURCE_TRADE)
        self.assertEqual(month["fetchedAt"], NOW1.isoformat())
        complexes = self.read("complexes.json")["complexes"]
        self.assertEqual(len(complexes), 2)
        self.assertIsNone(complexes[0]["lat"])  # 좌표를 임의로 만들지 않는다
        self.assertIsNone(complexes[0]["kapt"])
        cid = complexes[0]["id"]
        self.assertEqual(len(self.read(f"by-complex/{cid}.json")["trades"]), complexes[0]["tradeCount"])
        self.assertEqual(self.read("stats/summary.json")["months"][0]["median"], 31300)
        self.assertFalse(list(self.tmp.rglob(".staging-*")))

    def test_second_run_briefs_only_changes(self):
        self.run_at(NOW1)
        self.api.data["2026-11"].append(item(m=11, d=7, amount="33,300"))
        self.api.data["2026-10"][0] = item(d=1, amount="30,100", cdealType="O", cdealDay="26.11.09")
        self.assertEqual(self.run_at(NOW2), pipeline.EXIT_OK)
        b = self.read("briefing/latest.json")
        self.assertEqual(b["status"], "ok")
        self.assertEqual(b["previousDate"], "2026-11-10")
        self.assertEqual(b["newTradesTotal"], 1)
        self.assertEqual(b["newTrades"][0]["dealDate"], "2026-11-07")
        self.assertEqual(len(b["newCancellations"]), 1)
        self.assertEqual(self.read("manifest.json")["totals"], {"trades": 26, "cancelled": 1, "complexes": 2, "geocoded": 0, "rents": 0})
        self.assertEqual([i["date"] for i in self.read("briefing/index.json")["items"]], ["2026-11-11", "2026-11-10"])
        self.assertTrue((self.data / "briefing/archive/2026-11-10.json").exists())

    def test_no_new_trades(self):
        self.run_at(NOW1)
        self.run_at(NOW2)
        b = self.read("briefing/latest.json")
        self.assertEqual(b["status"], "no_new")
        self.assertEqual(b["newTradesTotal"], 0)

    def test_failure_keeps_last_good_data(self):
        self.run_at(NOW1)
        before = self.snapshot()
        self.api.error = ApiError("요청 실패: timeout")
        self.assertEqual(self.run_at(NOW2), pipeline.EXIT_FAILED)
        self.assertEqual(self.snapshot(), before)
        m = self.read("manifest.json")
        self.assertEqual(m["status"], "ok")
        self.assertEqual(m["generatedAt"], NOW1.isoformat())  # 마지막 정상 갱신 시각 유지
        self.assertEqual((m["lastAttemptAt"], m["lastAttemptStatus"]), (NOW2.isoformat(), "failed"))
        self.assertEqual(self.read("briefing/latest.json")["status"], "failed")  # '새 거래 없음'과 구분

    def test_auth_failure_stops_immediately(self):
        self.api.error = ApiError("인증 실패", auth=True)
        self.assertEqual(self.run_at(NOW1), pipeline.EXIT_FAILED)
        self.assertEqual(self.api.calls, 1)
        self.assertEqual(self.read("manifest.json")["status"], "pending")
        self.assertFalse((self.data / "trades").exists())

    def test_missing_key(self):
        self.assertEqual(self.run_at(NOW1, env={}), pipeline.EXIT_FAILED)
        m = self.read("manifest.json")
        self.assertEqual(m["status"], "pending")
        self.assertIn("MOLIT_API_KEY", m["lastAttemptMessage"])
        self.assertEqual(self.api.calls, 0)

    def test_sudden_drop_keeps_month(self):
        self.run_at(NOW1)
        before = (self.data / "trades/2026-10.json").read_bytes()
        self.api.data["2026-10"] = self.api.data["2026-10"][:3]  # 25건 → 3건: 비정상 응답
        self.assertEqual(self.run_at(NOW2), pipeline.EXIT_OK)
        self.assertEqual((self.data / "trades/2026-10.json").read_bytes(), before)
        m = self.read("manifest.json")
        self.assertEqual(m["lastAttemptStatus"], "partial")
        self.assertIn("2026-10", m["lastAttemptMessage"])

    def test_zero_trades_is_failure(self):
        self.api.data = {}
        self.assertEqual(self.run_at(NOW1), pipeline.EXIT_FAILED)
        self.assertEqual(self.read("manifest.json")["status"], "pending")

    def test_validation_failure_does_not_overwrite(self):
        self.run_at(NOW1)
        before = self.snapshot()
        self.api.data["2026-11"].append(item(m=11, d=8, amount="9,999,999"))  # 비정상 금액
        self.assertEqual(self.run_at(NOW2), pipeline.EXIT_FAILED)
        self.assertEqual(self.snapshot(), before)
        self.assertIn("검증 실패", self.read("manifest.json")["lastAttemptMessage"])
        self.assertFalse(list(self.tmp.rglob(".staging-*")))


class RentTest(PipelineTest):
    def test_normalize_rent(self):
        r = normalize_rent(rent_item(deposit=" 5,000", monthly="45", contractType="갱신", useRRRight="사용", preDeposit="4,000", preMonthlyRent="40"))
        self.assertEqual((r["deposit"], r["monthly"]), (5000, 45))
        self.assertEqual((r["contractType"], r["useRenewal"], r["prevDeposit"], r["prevMonthly"]), ("갱신", True, 4000, 40))
        j = normalize_rent(rent_item())
        self.assertEqual((j["deposit"], j["monthly"], j["useRenewal"], j["prevDeposit"]), (20000, 0, None, None))
        with self.assertRaises(ValueError):
            normalize_rent(rent_item(deposit="", monthly=""))

    def test_rents_collected_and_linked_to_complex(self):
        self.api.rents = {
            "2026-10": [rent_item(d=3), rent_item(d=9, deposit="3,000", monthly="60")],
            "2026-11": [rent_item(apt="전월세만있는단지", umd="덕암동", jibun="300", m=11, d=2)],
        }
        self.assertEqual(self.run_at(NOW1), pipeline.EXIT_OK)
        m = self.read("manifest.json")
        self.assertEqual(m["totals"]["rents"], 3)
        self.assertEqual([x["ym"] for x in m["rentMonths"]], ["2026-10", "2026-11"])
        self.assertEqual({s["id"]: s["status"] for s in m["sources"]}["molit-rent"], "connected")
        self.assertEqual(m["lawdCounts"], {"12150": 26})
        self.assertEqual(self.read("rents/2026-10.json")["source"], config.SOURCE_RENT)
        cx = {c["name"]: c for c in self.read("complexes.json")["complexes"]}
        self.assertEqual(len(cx), 3)  # 전월세만 있는 단지도 목록에 포함
        self.assertEqual(cx["테스트단지"]["rentCount"], 2)  # 매매 단지와 같은 단지로 연결
        self.assertEqual((cx["전월세만있는단지"]["tradeCount"], cx["전월세만있는단지"]["lastPrice"]), (0, None))
        self.assertEqual(len(self.read(f"by-complex-rent/{cx['테스트단지']['id']}.json")["rents"]), 2)
        self.assertEqual(self.read(f"by-complex/{cx['전월세만있는단지']['id']}.json")["trades"], [])

    def test_rent_failure_does_not_block_trades(self):
        self.api.rent_error = ApiError("인증 실패(HTTP 403)", auth=True)
        self.assertEqual(self.run_at(NOW1), pipeline.EXIT_OK)
        m = self.read("manifest.json")
        self.assertEqual(m["totals"]["trades"], 26)
        self.assertEqual({s["id"]: s["status"] for s in m["sources"]}["molit-rent"], "failed")
        self.assertIn("인증 실패", m["rentMessage"])
        self.assertFalse((self.data / "rents").exists())

    def test_rent_failure_keeps_previous_rents(self):
        self.api.rents = {"2026-10": [rent_item(d=3)]}
        self.run_at(NOW1)
        before = (self.data / "rents/2026-10.json").read_bytes()
        self.api.rent_error = ApiError("요청 실패: timeout")
        self.assertEqual(self.run_at(NOW2), pipeline.EXIT_OK)
        self.assertEqual((self.data / "rents/2026-10.json").read_bytes(), before)
        self.assertEqual(self.read("manifest.json")["totals"]["rents"], 1)


class EnrichTest(unittest.TestCase):
    def test_kapt_only_complexes_fill_the_list(self):
        from collector import stats
        items = {
            "K1": {"kaptCode": "K1", "name": "거래있는단지", "addr": "순천시 왕지동 100", "umd": "왕지동", "households": 500},
            "K2": {"kaptCode": "K2", "name": "거래없는단지", "addr": "순천시 조례동 55", "umd": "조례동", "households": 120,
                   "useDate": "1999-05-01", "roadAddress": "순천시 조례1길 5"},
            "K3": {"kaptCode": "K3", "name": "법정동모름", "addr": None, "umd": None},
        }
        base = [{"id": "c1", "name": "다른이름", "umdNm": "왕지동", "jibun": "100"}]
        matched = enrich.match_kapt(base, items)
        only = enrich.unmatched_kapt(items, matched)
        self.assertEqual([e["kaptCode"] for e in only], ["K2"])  # 법정동을 모르는 단지는 넣지 않는다
        cx = stats.build_complexes([], {}, {}, [], only)
        self.assertEqual((cx[0]["id"], cx[0]["name"], cx[0]["umdNm"], cx[0]["tradeCount"], cx[0]["buildYear"]),
                         ("kK2", "거래없는단지", "조례동", 0, 1999))
        self.assertEqual(cx[0]["kapt"]["households"], 120)
        self.assertIsNone(cx[0]["lat"])
        cache: dict = {}
        hit = {"documents": [{"address_name": "전남광주통합특별시 순천시 조례동 55", "x": "127.5", "y": "34.95"}]}
        seen = []
        enrich.geocode_complexes(cx, cache, "K", NOW1, get=lambda url, params, **k: (seen.append(params["query"]), json.dumps(hit).encode())[1])
        self.assertEqual(seen, ["순천시 조례1길 5"])  # 지번이 없으면 도로명 주소로 좌표를 찾는다
        self.assertEqual(cache["kK2"]["lat"], 34.95)

    def test_kapt_match_requires_unique_candidate(self):
        complexes = [{"id": "c1", "name": "테스트 단지", "umdNm": "왕지동", "jibun": "100"},
                     {"id": "c2", "name": "없는단지", "umdNm": "왕지동", "jibun": "999"}]
        items = {
            "K1": {"kaptCode": "K1", "name": "다른이름", "addr": "순천시 왕지동 100", "households": 500},
            "K2": {"kaptCode": "K2", "name": "테스트단지아파트", "addr": "순천시 조례동 100", "households": 300},
        }
        out = enrich.match_kapt(complexes, items)
        self.assertEqual(out["c1"]["kaptCode"], "K1")
        self.assertNotIn("c2", out)

    def test_presales_filters_region(self):
        payload = {"data": [
            {"HOUSE_MANAGE_NO": "1", "PBLANC_NO": "1", "HOUSE_NM": "테스트분양", "HSSPLY_ADRES": "순천시 왕지동 1",
             "TOT_SUPLY_HSHLDCO": 500, "RCRIT_PBLANC_DE": "2026-10-01", "MVN_PREARNGE_YM": "202812", "PBLANC_URL": "https://example.invalid"},
            {"HOUSE_MANAGE_NO": "2", "PBLANC_NO": "2", "HOUSE_NM": "다른지역", "HSSPLY_ADRES": "서울특별시 순천향로 1"},
        ]}
        out = enrich.fetch_presales("K", get=lambda *a, **k: json.dumps(payload).encode())
        self.assertEqual(len(out), 1)  # '순천향로'처럼 다른 지역 주소는 제외
        self.assertEqual(out[0]["name"], "테스트분양")
        self.assertIsNone(out[0]["receiptStart"])  # 공고에 없는 일정은 만들지 않는다

    def test_presale_prices(self):
        payload = {"data": [
            {"HOUSE_TY": "084.9700A", "SUPLY_AR": "112.3", "SUPLY_HSHLDCO": 100, "SPSPLY_HSHLDCO": 80, "LTTOT_TOP_AMOUNT": "45,800"},
            {"HOUSE_TY": "059.9000B", "LTTOT_TOP_AMOUNT": ""},  # 금액 없는 행은 넣지 않는다
        ]}
        out = enrich.fetch_presale_prices("K", "2026000001", get=lambda *a, **k: json.dumps(payload).encode())
        self.assertEqual(out, [{"type": "084.9700A", "price": 45800, "supplyArea": "112.3", "households": 180}])

    def test_price_index_parses_only_suncheon_rows(self):
        rows = [
            {"WRTTIME_IDTFR_ID": "202607", "DTA_VAL": 100.3491, "CLS_FULLNM": "전남광주>전남>순천시"},
            {"WRTTIME_IDTFR_ID": "202606", "DTA_VAL": 100, "CLS_FULLNM": "전남광주>전남>순천시"},
            {"WRTTIME_IDTFR_ID": "202606", "DTA_VAL": 99, "CLS_FULLNM": "전남광주>전남>여수시"},
        ]
        ok = {"SttsApiTblData": [{"head": [{"list_total_count": 3}, {"RESULT": {"CODE": "INFO-000"}}]}, {"row": rows}]}
        out = enrich.fetch_price_index("K", get=lambda *a, **k: json.dumps(ok).encode())
        self.assertEqual(out, [{"ym": "2026-06", "value": 100.0}, {"ym": "2026-07", "value": 100.35}])
        err = {"RESULT": {"CODE": "ERROR-290", "MESSAGE": "인증키가 유효하지 않습니다."}}
        with self.assertRaises(ApiError):
            enrich.fetch_price_index("K", get=lambda *a, **k: json.dumps(err).encode())

    def test_schools_filtered_to_suncheon(self):
        items = [
            {"schoolId": "B1", "schoolNm": "순천테스트초등학교", "schoolSe": "초등학교", "operSttus": "운영",
             "rdnmadr": "전남광주통합특별시 순천시 테스트길 1", "latitude": "34.95", "longitude": "127.52"},
            {"schoolId": "B2", "schoolNm": "다른시학교", "schoolSe": "중학교", "operSttus": "운영", "rdnmadr": "전남광주통합특별시 여수시 길 2"},
            {"schoolId": "B3", "schoolNm": "폐교", "schoolSe": "초등학교", "operSttus": "폐교", "rdnmadr": "전남광주통합특별시 순천시 길 3"},
            {"schoolId": "B4", "schoolNm": "좌표없는중학교", "schoolSe": "중학교", "operSttus": "운영", "lnmadr": "전남광주통합특별시 순천시 조례동 1"},
        ]
        body = {"response": {"header": {"resultCode": "00"}, "body": {"items": items, "totalCount": 4}}}
        out = enrich.fetch_schools("K", get=lambda *a, **k: json.dumps(body).encode())
        self.assertEqual([s["id"] for s in out], ["B4", "B1"])
        self.assertEqual((out[1]["lat"], out[1]["lng"]), (34.95, 127.52))
        self.assertIsNone(out[0]["lat"])  # 좌표가 없으면 만들지 않는다
        auth = {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"returnAuthMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}
        with self.assertRaises(ApiError):
            enrich.fetch_schools("K", get=lambda *a, **k: json.dumps(auth).encode())

    def test_lh_notices_only_suncheon(self):
        rows = [
            {"PAN_NM": "순천신대 A-1블록 행복주택 입주자 모집공고", "UPP_AIS_TP_NM": "임대주택", "AIS_TP_CD_NM": "행복주택",
             "CNP_CD_NM": "전남광주", "PAN_SS": "공고중", "PAN_NT_ST_DT": "2026.10.20", "CLSG_DT": "2026.11.20",
             "DTL_URL": "https://apply.lh.or.kr/LH/index.html?gv_param=CCR_CNNT_SYS_DS_CD:02,PAN_ID:0000061111,LCC:Y"},
            {"PAN_NM": "여수 국민임대 예비입주자 모집", "DTL_URL": "https://apply.lh.or.kr/x?gv_param=PAN_ID:0000062222"},
            {"PAN_NM": "순천신대 A-1블록 행복주택 입주자 모집공고", "DTL_URL": "https://apply.lh.or.kr/x?gv_param=PAN_ID:0000061111"},
        ]
        seen = {}
        def get(url, params, **k):
            seen.update(params)
            return json.dumps([{"dsSch": [{"PAGE": "1"}]}, {"resHeader": [{"SS_CODE": "Y"}], "dsList": rows}]).encode()
        out = enrich.fetch_lh_notices("K", NOW1, get=get)
        self.assertEqual(seen["PAN_NM"], "순천")
        self.assertEqual(seen["CLSG_DT"], "2026.11.10")
        self.assertEqual(len(out), 1)  # 다른 지역·중복 공고 제외
        self.assertEqual((out[0]["id"], out[0]["kind"], out[0]["status"], out[0]["date"], out[0]["closeDate"]),
                         ("0000061111", "임대주택 · 행복주택", "공고중", "2026-10-20", "2026-11-20"))
        self.assertEqual(enrich.fetch_lh_notices("K", NOW1, get=lambda *a, **k: b'[{"dsSch":[]},{"dsList":[]}]'), [])

    def test_geocode_no_result_makes_no_coordinate(self):
        cache: dict = {}
        c = [{"id": "c1", "umdNm": "왕지동", "jibun": "100"}]
        enrich.geocode_complexes(c, cache, "K", NOW1, get=lambda *a, **k: b'{"documents": []}')
        self.assertIsNone(cache["c1"]["lat"])
        hit = {"documents": [{"address_name": "전남광주통합특별시 순천시 왕지동 100", "x": "127.52", "y": "34.97"}]}
        cache.clear()
        enrich.geocode_complexes(c, cache, "K", NOW1, get=lambda *a, **k: json.dumps(hit).encode())
        self.assertEqual((cache["c1"]["lat"], cache["c1"]["lng"]), (34.97, 127.52))


if __name__ == "__main__":
    unittest.main()
