"""화면 점검용 '가상 테스트 데이터' 생성기.

실제 수집 파이프라인을 가상 API 응답으로 두 번(어제·오늘) 돌려 tests/fixtures/data 에 결과를 만든다.
단지명은 모두 '[가상]' 으로 시작하고 manifest.fixture=true 가 기록되어 화면에 경고 띠가 표시된다.
이 데이터는 `npm run dev:fixture` 에서만 쓰이며 public/data(운영 데이터)와 프로덕션 빌드에는 들어가지 않는다.
"""
from __future__ import annotations

import json
import random
import shutil
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from collector import config, pipeline, supply  # noqa: E402
from collector.store import read_json, write_json  # noqa: E402

OUT = config.ROOT / "tests" / "fixtures" / "data"
CACHE = config.ROOT / "tests" / "fixtures" / "cache"

# (가상 단지명, 법정동, 지번, 건축년도, [(전용면적, 기준가 만원)], 가상 좌표)
COMPLEXES = [
    ("[가상] 왕지하늘채", "왕지동", "9001", 2016, [(84.97, 41000), (59.98, 31000)], (34.9689, 127.5262)),
    ("[가상] 왕지푸른숲", "왕지동", "9002", 2009, [(84.92, 33000), (114.7, 42000)], (34.9712, 127.5301)),
    ("[가상] 조례한빛", "조례동", "9003", 2003, [(59.82, 17500), (84.9, 24000)], (34.9581, 127.5215)),
    ("[가상] 조례호수마을", "조례동", "9004", 2019, [(84.99, 45500), (101.5, 55000)], (34.9552, 127.5281)),
    ("[가상] 연향새솔", "연향동", "9005", 1998, [(49.9, 11000), (59.9, 14500)], (34.9478, 127.5248)),
    ("[가상] 연향가람", "연향동", "9006", 2005, [(84.6, 26000)], (34.9441, 127.5199)),
    ("[가상] 신대누리", "해룡면 신대리", "9007", 2014, [(84.95, 38000), (59.95, 29000)], (34.9333, 127.5561)),
    ("[가상] 신대해오름", "해룡면 신대리", "9008", 2021, [(84.98, 47000), (109.3, 58000)], (34.9301, 127.5602)),
    ("[가상] 오천물빛", "오천동", "9009", 2017, [(84.9, 39500), (74.8, 35000)], (34.9305, 127.5118)),
    ("[가상] 용당솔밭", "용당동", "9010", 2001, [(59.7, 13500), (84.7, 19000)], (34.9702, 127.4861)),
    ("[가상] 풍덕마루", "풍덕동", "9011", 2011, [(84.8, 28500)], (34.9372, 127.5012)),
    ("[가상] 덕암한울", "덕암동", "9012", 1996, [(59.4, 10500), (84.4, 14000)], (34.9408, 127.4958)),
]
COORDS = {f"순천시 {c[1]} {c[2]}": c[5] for c in COMPLEXES}
FIX_STATE = {"today": False}  # 두 번째(오늘) 수집 여부 — 새 공고를 흉내 내는 데 쓴다
# 가상 법정동 코드(뒤 5자리)
FIX_DONG = {n: f"{10100 + i * 100}" for i, n in enumerate(sorted({c[1] for c in COMPLEXES}))}
# 수집 기간에 거래가 없어 K-apt 단지 목록으로만 확인되는 가상 단지 (단지명, 읍면동, 리, 도로명주소, 좌표)
KAPT_ONLY = [
    ("[가상] 매곡고요", "매곡동", "", "순천시 가상매곡길 11", (34.9611, 127.4802)),
    ("[가상] 선평들녘", "서면", "선평리", "순천시 서면 가상선평길 7", (34.9903, 127.4905)),
]
COORDS.update({k[3]: k[4] for k in KAPT_ONLY})


def make_rents(rng: random.Random, ym: str) -> list[dict]:
    y, m = (int(x) for x in ym.split("-"))
    items = []
    for name, umd, jibun, build, types, _ in COMPLEXES:
        for _ in range(rng.choice([0, 1, 1, 2])):
            area, base = rng.choice(types)
            jeonse = rng.random() < 0.6
            deposit = int(round(base * (0.62 if jeonse else 0.12) * rng.uniform(0.92, 1.08), -2))
            monthly = 0 if jeonse else int(round(base * 0.0022 * rng.uniform(0.9, 1.1)))
            renew = rng.random() < 0.25
            items.append({
                "aptNm": name, "umdNm": umd, "jibun": jibun, "deposit": f"{deposit:,}", "monthlyRent": str(monthly),
                "dealYear": str(y), "dealMonth": str(m), "dealDay": str(rng.randint(1, 27)),
                "excluUseAr": str(area), "floor": str(rng.randint(1, 20)), "buildYear": str(build),
                "contractTerm": f"{y % 100:02d}.{m:02d}~{(y + 2) % 100:02d}.{m:02d}",
                "contractType": "갱신" if renew else "신규", "useRRRight": "사용" if renew and rng.random() < 0.5 else "",
                "preDeposit": f"{int(deposit * 0.95):,}" if renew else "", "preMonthlyRent": str(monthly) if renew else "",
            })
    return items


def make_month(rng: random.Random, ym: str, idx: int, n_months: int) -> list[dict]:
    y, m = (int(x) for x in ym.split("-"))
    items = []
    for name, umd, jibun, build, types, _ in COMPLEXES:
        for _ in range(rng.choice([0, 1, 1, 2, 2, 3])):
            area, base = rng.choice(types)
            floor = rng.randint(1, 20)
            drift = 1 + 0.04 * (idx / n_months) + rng.uniform(-0.04, 0.04) + (floor - 10) * 0.003
            price = int(round(base * drift, -2))
            cancelled = rng.random() < 0.03
            day = rng.randint(1, 27)
            items.append({
                "aptNm": name, "umdNm": umd, "jibun": jibun, "dealAmount": f"{price:,}",
                "dealYear": str(y), "dealMonth": str(m), "dealDay": str(day),
                "excluUseAr": str(area), "floor": str(floor), "buildYear": str(build),
                "dealingGbn": "직거래" if rng.random() < 0.1 else "중개거래",
                "cdealType": "O" if cancelled else "", "cdealDay": f"{y % 100:02d}.{m:02d}.{min(day + 1, 28):02d}" if cancelled else "",
                "rgstDate": "", "aptDong": "", "slerGbn": "개인", "buyerGbn": "개인",
                "estateAgentSggNm": "순천시", "landLeaseholdGbn": "N", "roadNm": "",
                "sggCd": "12150", "umdCd": FIX_DONG[umd], "bonbun": jibun.zfill(4), "bubun": "0000", "landCd": "1",
            })
    return items


def fake_get(url, params=None, **_):
    if url == config.VWORLD_ADDRESS_URL:
        xy = COORDS.get(params["address"])
        if not xy:
            return json.dumps({"response": {"status": "NOT_FOUND"}}).encode()
        return json.dumps({"response": {"status": "OK", "refined": {"text": "전남광주통합특별시 " + params["address"]},
                                        "result": {"point": {"x": str(xy[1]), "y": str(xy[0])}}}}).encode()
    if url == config.KAPT_LIST_URL:
        items = [{"kaptCode": f"F{i:04d}", "kaptName": c[0], "as3": c[1].split()[0], "as4": " ".join(c[1].split()[1:])}
                 for i, c in enumerate(COMPLEXES[:8])]
        items += [{"kaptCode": f"X{i:04d}", "kaptName": k[0], "as3": k[1], "as4": k[2]} for i, k in enumerate(KAPT_ONLY)]
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": items, "totalCount": len(items)}}}).encode()
    if url == config.KAPT_BASIC_URL:
        if params["kaptCode"].startswith("X"):
            k = KAPT_ONLY[int(params["kaptCode"][1:])]
            item = {"kaptName": k[0], "kaptAddr": f"순천시 {k[1]} {k[2]}".strip(), "doroJuso": k[3], "kaptdaCnt": "180",
                    "kaptDongCnt": "3", "kaptTopFloor": "12", "kaptUsedate": "19940620", "codeHeatNm": "개별난방",
                    "codeHallNm": "복도식", "kaptBcompany": "가상건설"}
            return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"item": item}}}).encode()
        c = COMPLEXES[int(params["kaptCode"][1:])]
        item = {"kaptName": c[0], "kaptAddr": f"순천시 {c[1]} {c[2]}", "doroJuso": None, "kaptdaCnt": "640",
                "kaptDongCnt": "8", "kaptTopFloor": "20", "kaptUsedate": f"{c[3]}0315", "codeHeatNm": "개별난방",
                "codeHallNm": "계단식", "kaptBcompany": "가상건설"}
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"item": item}}}).encode()
    if url == config.KAPT_DETAIL_URL:
        item = {"kaptdPcnt": "120", "kaptdPcntu": "680", "welfareFacility": "관리사무소, 노인정, 어린이놀이터",
                "convenientFacility": "관공서() 병원() 대형상가()", "educationFacility": "초등학교()", "kaptdWtimebus": "5분이내"}
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"item": item}}}).encode()
    if url == config.APPLYHOME_URL:
        today = config.now_kst().date()
        d = lambda n: (today + timedelta(days=n)).isoformat()  # noqa: E731
        rows = [{"HOUSE_MANAGE_NO": "F1", "PBLANC_NO": "F1", "HOUSE_NM": "[가상] 순천 테스트 분양단지",
                 "HSSPLY_ADRES": "전남광주통합특별시 순천시 왕지동 9999", "TOT_SUPLY_HSHLDCO": 512,
                 "RCRIT_PBLANC_DE": d(-12), "RCEPT_BGNDE": d(-1), "RCEPT_ENDDE": d(1),
                 "PRZWNER_PRESNATN_DE": d(8), "CNTRCT_CNCLS_BGNDE": d(20), "CNTRCT_CNCLS_ENDDE": d(22),
                 "MVN_PREARNGE_YM": "202903", "PBLANC_URL": "https://www.applyhome.co.kr/"}]
        if FIX_STATE["today"]:  # 오늘 수집에서 새로 확인되는 공고
            rows.append({"HOUSE_MANAGE_NO": "F2", "PBLANC_NO": "F2", "HOUSE_NM": "[가상] 순천 새소식 분양단지",
                         "HSSPLY_ADRES": "전남광주통합특별시 순천시 조례동 9998", "TOT_SUPLY_HSHLDCO": 284,
                         "RCRIT_PBLANC_DE": d(0), "RCEPT_BGNDE": d(10), "RCEPT_ENDDE": d(12),
                         "PRZWNER_PRESNATN_DE": d(19), "MVN_PREARNGE_YM": "202909", "PBLANC_URL": "https://www.applyhome.co.kr/"})
        return json.dumps({"data": rows}).encode()
    if url == supply.BJDONG_ZIP_URL:
        import io, zipfile
        names = sorted({c[1] for c in COMPLEXES})
        text = "법정동코드\t법정동명\t폐지여부\n" + "".join(f"12150{FIX_DONG[n]}\t전남광주통합특별시 순천시 {n}\t존재\n" for n in names)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("codes.txt", text.encode("cp949"))
        return buf.getvalue()
    if url == supply.HUB_PERMIT_URL:
        rows = []
        if params["bjdongCd"] == FIX_DONG["왕지동"]:
            rows = [{"mgmHsrgstPk": "FIXP1", "platPlc": "전남광주통합특별시 순천시 왕지동 9100", "bldNm": "[가상] 왕지 새공급단지",
                     "totHhldCnt": "684", "purpsCdNm": "공동주택", "apprvDay": "20260512", "stcnsDay": "20260901", "stcnsSchedDay": ""},
                    {"mgmHsrgstPk": "FIXP2", "platPlc": "전남광주통합특별시 순천시 왕지동 9200", "bldNm": "[가상] 왕지 예정단지",
                     "totHhldCnt": "312", "purpsCdNm": "공동주택", "apprvDay": "20260930", "stcnsDay": "", "stcnsSchedDay": "20270301"}]
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": rows} if rows else "", "totalCount": len(rows)}}}).encode()
    if url in (supply.REGISTER_RECAP_URL, supply.REGISTER_TITLE_URL):
        row = {"bun": params["bun"], "ji": params["ji"]}
        if url == supply.REGISTER_RECAP_URL:
            row.update({"hhldCnt": "596", "mainBldCnt": "7", "totPkngCnt": "742", "bcRat": "17.8", "vlRat": "219.5", "useAprDay": "20120420"})
        else:
            row.update({"mainPurpsCdNm": "공동주택", "grndFlrCnt": "18", "ugrndFlrCnt": "2", "hhldCnt": "85"})
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": row}, "totalCount": 1}}}).encode()
    if url == supply.MOLIT_STAT_URL:
        ym = params["start_dt"]
        i = (int(ym[:4]) * 12 + int(ym[4:])) % 24
        if params["form_id"] == "2082":
            rows = [{"구분": "전남광주", "시군구": "순천시", "미분양현황": str(900 + i * 17), "date": ym}]
        else:
            rows = [{"시군구": "순천시", "부문": "계", "규모": "계", "호": str(120 + i * 3)}]
        return json.dumps({"result_status": {"status_code": "INFO-000"}, "result_data": {"unitName": "호", "formList": rows}}).encode()
    if url == supply.KOSIS_URL:
        now = config.now_kst()
        rows = [{"C1": "12150", "C1_NM": "순천시", "PRD_DE": ym.replace("-", ""), "DT": str(279000 - i * 45)}
                for i, ym in enumerate(config.recent_yms(now, 60)[:-1])]
        return json.dumps(rows).encode()
    if url == config.LH_NOTICE_URL:
        rows = [{"PAN_NM": "[가상] 순천 테스트지구 A-1블록 행복주택 입주자 모집공고", "UPP_AIS_TP_NM": "임대주택",
                 "AIS_TP_CD_NM": "행복주택", "CNP_CD_NM": "전남광주", "PAN_SS": "공고중", "PAN_NT_ST_DT": "2026.10.28",
                 "CLSG_DT": "2026.11.27", "DTL_URL": "https://apply.lh.or.kr/x?gv_param=PAN_ID:FIXTURE0001"},
                {"PAN_NM": "[가상] 순천 테스트지구 B-2블록 공공분양 입주자 모집공고", "UPP_AIS_TP_NM": "분양주택",
                 "AIS_TP_CD_NM": "공공분양", "CNP_CD_NM": "전남광주", "PAN_SS": "접수마감", "PAN_NT_ST_DT": "2026.08.11",
                 "CLSG_DT": "2026.09.02", "DTL_URL": "https://apply.lh.or.kr/x?gv_param=PAN_ID:FIXTURE0002"}]
        return json.dumps([{"dsSch": [{}]}, {"resHeader": [{"SS_CODE": "Y"}], "dsList": rows}]).encode()
    if url == config.APPLYHOME_MDL_URL:
        rows = [{"HOUSE_TY": "084.9800A", "SUPLY_AR": "113.2", "SUPLY_HSHLDCO": 180, "SPSPLY_HSHLDCO": 120, "LTTOT_TOP_AMOUNT": "46,500"},
                {"HOUSE_TY": "059.9500B", "SUPLY_AR": "81.4", "SUPLY_HSHLDCO": 120, "SPSPLY_HSHLDCO": 92, "LTTOT_TOP_AMOUNT": "33,900"}]
        return json.dumps({"data": rows}).encode()
    if url == config.REB_DATA_URL:
        now = config.now_kst()
        rows = [{"WRTTIME_IDTFR_ID": ym.replace("-", ""), "DTA_VAL": round(98 + i * 0.12 + (i % 5) * 0.05, 3),
                 "CLS_FULLNM": "전남광주>전남>순천시"} for i, ym in enumerate(config.recent_yms(now, 26)[:-2])]
        return json.dumps({"SttsApiTblData": [{"head": [{"list_total_count": len(rows)}, {"RESULT": {"CODE": "INFO-000"}}]},
                                              {"row": rows}]}).encode()
    if url == config.SCHOOL_URL:
        names = [("[가상] 왕지초등학교", "초등학교", 34.9695, 127.5271), ("[가상] 조례초등학교", "초등학교", 34.9571, 127.5223),
                 ("[가상] 연향중학교", "중학교", 34.9465, 127.5232), ("[가상] 신대중학교", "중학교", 34.9322, 127.5575),
                 ("[가상] 순천가상고등학교", "고등학교", 34.9512, 127.5101), ("[가상] 용당초등학교", "초등학교", 34.9711, 127.4872)]
        items = [{"schoolId": f"FX{i}", "schoolNm": n, "schoolSe": k, "operSttus": "운영",
                  "rdnmadr": f"전남광주통합특별시 순천시 가상학교길 {i + 1}", "latitude": str(la), "longitude": str(lo)}
                 for i, (n, k, la, lo) in enumerate(names)]
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": items, "totalCount": len(items)}}}).encode()
    raise AssertionError(url)


def main() -> None:
    for d in (OUT, CACHE):
        shutil.rmtree(d, ignore_errors=True)
    now = config.now_kst()
    yesterday = now - timedelta(days=1)
    rng = random.Random(20261111)
    yms = config.recent_yms(now, 24)
    data = {ym: make_month(rng, ym, i, len(yms)) for i, ym in enumerate(yms)}
    cur = yms[-1]
    # 이번 달 거래는 오늘 날짜 이전으로 맞춘다
    for it in data[cur]:
        it["dealDay"] = str(rng.randint(1, max(1, now.day - 1)))
        it["cdealType"] = it["cdealDay"] = ""

    held = data[cur][-4:]  # 오늘 '새로 확인'될 거래
    state = {"today": False}

    def fetch_month(key, code, ym):
        if code != config.PRIMARY_LAWD:
            return []
        items = list(data[ym])
        if ym == cur and not state["today"]:
            items = [i for i in items if i not in held]
        return items

    rents = {ym: make_rents(rng, ym) for ym in yms}
    for it in rents[cur]:
        it["dealDay"] = str(rng.randint(1, max(1, now.day - 1)))

    def fetch_rent_month(key, code, ym):
        return list(rents.get(ym, [])) if code == config.PRIMARY_LAWD else []

    env = {"MOLIT_API_KEY": "fixture", "VWORLD_API_KEY": "fixture", "REB_API_KEY": "fixture",
           "MOLIT_STAT_API_KEY": "fixture", "KOSIS_API_KEY": "fixture"}
    quiet = lambda s: None  # noqa: E731
    assert pipeline.run(now=yesterday, data_dir=OUT, cache_dir=CACHE, env=env, fetch_month=fetch_month, fetch_rent_month=fetch_rent_month, get=fake_get, log=quiet) == 0
    state["today"] = True
    FIX_STATE["today"] = True
    prev = data[yms[-2]][0]  # 지난달 거래 1건이 오늘 해제로 확인됨
    prev["cdealType"], prev["cdealDay"] = "O", f"{now.year % 100:02d}.{now.month:02d}.{max(1, now.day - 1):02d}"
    assert pipeline.run(now=now, data_dir=OUT, cache_dir=CACHE, env=env, fetch_month=fetch_month, fetch_rent_month=fetch_rent_month, get=fake_get, log=print) == 0

    m = read_json(OUT / "manifest.json")
    m["fixture"] = True
    write_json(OUT / "manifest.json", m, pretty=True)
    shutil.rmtree(CACHE, ignore_errors=True)
    print(f"가상 테스트 데이터 생성 완료: {OUT}")


if __name__ == "__main__":
    main()
