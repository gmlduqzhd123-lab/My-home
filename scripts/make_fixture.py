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

from collector import config, pipeline  # noqa: E402
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
            })
    return items


def fake_get(url, params=None, **_):
    if url == config.KAKAO_ADDRESS_URL:
        xy = COORDS.get(params["query"])
        docs = [{"address_name": "전남광주통합특별시 " + params["query"], "x": str(xy[1]), "y": str(xy[0])}] if xy else []
        return json.dumps({"documents": docs}).encode()
    if url == config.KAPT_LIST_URL:
        items = [{"kaptCode": f"F{i:04d}", "kaptName": c[0]} for i, c in enumerate(COMPLEXES[:8])]
        return json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": items, "totalCount": len(items)}}}).encode()
    if url == config.KAPT_BASIC_URL:
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
        row = {"HOUSE_MANAGE_NO": "F1", "PBLANC_NO": "F1", "HOUSE_NM": "[가상] 순천 테스트 분양단지",
               "HSSPLY_ADRES": "전남광주통합특별시 순천시 왕지동 9999", "TOT_SUPLY_HSHLDCO": 512,
               "RCRIT_PBLANC_DE": "2026-10-16", "RCEPT_BGNDE": "2026-10-27", "RCEPT_ENDDE": "2026-10-29",
               "PRZWNER_PRESNATN_DE": "2026-11-05", "CNTRCT_CNCLS_BGNDE": "2026-11-17", "CNTRCT_CNCLS_ENDDE": "2026-11-19",
               "MVN_PREARNGE_YM": "202903", "PBLANC_URL": "https://www.applyhome.co.kr/"}
        return json.dumps({"data": [row]}).encode()
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

    env = {"MOLIT_API_KEY": "fixture", "KAKAO_REST_API_KEY": "fixture"}
    quiet = lambda s: None  # noqa: E731
    assert pipeline.run(now=yesterday, data_dir=OUT, cache_dir=CACHE, env=env, fetch_month=fetch_month, get=fake_get, log=quiet) == 0
    state["today"] = True
    prev = data[yms[-2]][0]  # 지난달 거래 1건이 오늘 해제로 확인됨
    prev["cdealType"], prev["cdealDay"] = "O", f"{now.year % 100:02d}.{now.month:02d}.{max(1, now.day - 1):02d}"
    assert pipeline.run(now=now, data_dir=OUT, cache_dir=CACHE, env=env, fetch_month=fetch_month, get=fake_get, log=print) == 0

    m = read_json(OUT / "manifest.json")
    m["fixture"] = True
    write_json(OUT / "manifest.json", m, pretty=True)
    shutil.rmtree(CACHE, ignore_errors=True)
    print(f"가상 테스트 데이터 생성 완료: {OUT}")


if __name__ == "__main__":
    main()
