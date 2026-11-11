"""수집 파이프라인.

공공 API 호출 → 응답 검증 → 정규화 → 중복 제거 → 해제·정정 확인 → 통계 → JSON(스테이징) → 검증 → 반영.
어느 단계든 실패하면 운영 데이터 파일은 건드리지 않고, 시도 기록(manifest.lastAttempt*)과 '조회 실패' 브리핑만 남긴다.
"""
from __future__ import annotations

import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Callable, Mapping

from . import briefing, config, enrich, molit, stats, validate
from .http import ApiError, http_get
from .merge import MUTABLE, RENT_MUTABLE, Diff, is_active, merge_month
from .normalize import assign_ids, assign_rent_ids, normalize_items, normalize_rent
from .store import commit, read_json, write_json

EXIT_OK, EXIT_FAILED = 0, 3


def pending_manifest() -> dict:
    return {
        "schemaVersion": config.SCHEMA_VERSION,
        "status": "pending",
        "region": {"name": config.REGION_NAME, "lawdCd": config.PRIMARY_LAWD},
        "generatedAt": None,
        "lastAttemptAt": None,
        "lastAttemptStatus": None,
        "lastAttemptMessage": None,
        "months": [],
        "totals": {"trades": 0, "cancelled": 0, "complexes": 0, "geocoded": 0},
        "sources": sources(trade="pending", kapt="pending", geo="pending", presale="pending"),
    }


def sources(*, trade: str, kapt: str, geo: str, presale: str, rent: str = "pending", index: str = "pending",
            school: str = "pending") -> list[dict]:
    return [
        {"id": "molit-trade", "name": config.SOURCE_TRADE, "provider": "국토교통부 · 공공데이터포털",
         "url": config.MOLIT_TRADE_PAGE, "status": trade},
        {"id": "molit-rent", "name": config.SOURCE_RENT, "provider": "국토교통부 · 공공데이터포털",
         "url": config.MOLIT_RENT_PAGE, "status": rent},
        {"id": "kapt", "name": "공동주택 단지 목록·기본정보 (K-apt)", "provider": "국토교통부 · 공공데이터포털",
         "url": config.KAPT_BASIC_PAGE, "status": kapt},
        {"id": "kakao-geo", "name": "단지 좌표 (Kakao 주소 검색)", "provider": "Kakao",
         "url": "https://developers.kakao.com/docs/ko/local/dev-guide", "status": geo},
        {"id": "applyhome", "name": "청약홈 분양정보 조회 서비스", "provider": "한국부동산원 · 공공데이터포털",
         "url": config.APPLYHOME_PAGE, "status": presale},
        {"id": "reb-index", "name": "부동산통계(R-ONE) 아파트 매매가격지수", "provider": "한국부동산원",
         "url": config.REB_PAGE, "status": index},
        {"id": "schools", "name": "전국초중등학교위치표준데이터", "provider": "한국교육시설안전원 · 공공데이터포털",
         "url": config.SCHOOL_PAGE, "status": school},
    ]


def init_data(data_dir: Path, now: datetime) -> None:
    """수집 전 초기 상태(연결 대기) 파일을 만든다. 이미 있는 파일은 건드리지 않는다."""
    defaults = {
        "manifest.json": pending_manifest(),
        "presales.json": {"status": "pending", "fetchedAt": None, "message": None,
                          "source": {"name": "한국부동산원 청약홈 분양정보 조회 서비스", "url": config.APPLYHOME_PAGE},
                          "items": []},
        "developments.json": {"status": "pending", "fetchedAt": None,
                              "message": "개발·고시 공고는 공식 공개 API 가 확인되지 않아 아직 연계하지 않았습니다.", "items": []},
        "schools.json": {"status": "pending", "fetchedAt": None, "message": "학교 위치 표준데이터 연계 준비 중입니다.",
                         "source": {"name": "전국초중등학교위치표준데이터",
                                    "url": "https://www.data.go.kr/data/15021148/standard.do"}, "items": []},
    }
    for name, obj in defaults.items():
        if not (data_dir / name).exists():
            write_json(data_dir / name, obj, pretty=True)


def collect_month(key: str, ym: str, existing: list[dict], now_iso: str, fetch_month: Callable,
                  log: Callable[[str], None], *, normalize=None, assign=assign_ids, mutable=MUTABLE,
                  counts: dict[str, int] | None = None) -> tuple[list[dict], Diff]:
    """한 계약월 수집·병합(매매·전월세 공용). 실패하면 ApiError. counts 에 지역코드별 수신 건수를 누적한다."""
    per_source: list[list[dict]] = []
    errors: list[str] = []
    for code in config.LAWD_CODES:
        try:
            items = fetch_month(key, code, ym)
        except ApiError as e:
            if e.auth:
                raise
            errors.append(f"{code}: {e}")
            continue
        if counts is not None:
            counts[code] = counts.get(code, 0) + len(items)
        ok, rejected = normalize_items(items, normalize)
        if len(rejected) > max(2, len(items) * 0.05):
            raise ApiError(f"{ym} {code}: 형식 오류 {len(rejected)}/{len(items)}건 — 응답 구조 변경 의심")
        if rejected:
            log(f"  {ym} {code}: 형식 오류로 제외 {len(rejected)}건 ({rejected[0]})")
        per_source.append([t for t in ok if t["dealDate"][:7] == ym])
    if not per_source:
        raise ApiError(f"{ym}: 모든 지역코드 조회 실패 ({'; '.join(errors)})")
    if errors:
        log(f"  {ym}: 일부 지역코드 조회 실패 ({'; '.join(errors)})")

    fetched = assign(per_source)
    prev_active = sum(1 for t in existing if is_active(t))
    if prev_active >= 20 and len(fetched) < prev_active * 0.5:
        raise ApiError(f"{ym}: 조회 {len(fetched)}건이 기존 {prev_active}건의 절반 미만 — 비정상 응답으로 보고 기존 자료 유지")
    return merge_month(existing, fetched, now_iso, mutable)


def collect_rents(key: str, yms: list[str], month_files: dict[str, dict], now_iso: str, fetch_rent_month: Callable,
                  log: Callable[[str], None]) -> tuple[set[str], list[str], str | None]:
    """전월세 수집. (갱신된 달, 실패한 달, 치명 오류 메시지) 반환. month_files 를 제자리에서 갱신한다."""
    updated: set[str] = set()
    failed: list[str] = []
    for ym in yms:
        existing = (month_files.get(ym) or {}).get("rents", [])
        try:
            merged, d = collect_month(key, ym, existing, now_iso, fetch_rent_month, log,
                                      normalize=normalize_rent, assign=assign_rent_ids, mutable=RENT_MUTABLE)
        except ApiError as e:
            if e.auth:
                return updated, failed, str(e)
            log(f"  [전월세 월 실패] {e}")
            failed.append(ym)
            continue
        updated.add(ym)
        if merged or ym in month_files:
            month_files[ym] = {"ym": ym, "fetchedAt": now_iso, "source": config.SOURCE_RENT, "rents": merged}
        log(f"  전월세 {ym}: {len(merged)}건 (신규 {len(d.new)})")
    return updated, failed, None


def run(
    *,
    now: datetime | None = None,
    data_dir: Path | None = None,
    cache_dir: Path | None = None,
    env: Mapping[str, str] | None = None,
    months: int | None = None,
    fetch_month: Callable = molit.fetch_month,
    fetch_rent_month: Callable = molit.fetch_rent_month,
    get: Callable = http_get,
    log: Callable[[str], None] = print,
) -> int:
    now = now or config.now_kst()
    data_dir = data_dir or config.DATA_DIR
    cache_dir = cache_dir or config.CACHE_DIR
    env = env if env is not None else {}
    now_iso, today = now.isoformat(), now.date().isoformat()

    init_data(data_dir, now)
    manifest = read_json(data_dir / "manifest.json") or pending_manifest()
    index = read_json(data_dir / "briefing" / "index.json")
    latest = read_json(data_dir / "briefing" / "latest.json")
    prev_dates = [i["date"] for i in (index or {}).get("items", []) if i["date"] < today and i["status"] != "failed"]
    previous_date = max(prev_dates) if prev_dates else None
    initial = manifest.get("status") != "ok"

    def fail(message: str) -> int:
        """운영 데이터는 그대로 두고 시도 기록과 실패 브리핑만 남긴다."""
        log(f"[실패] {message}")
        manifest.update({"lastAttemptAt": now_iso, "lastAttemptStatus": "failed", "lastAttemptMessage": message})
        write_json(data_dir / "manifest.json", manifest, pretty=True)
        same_day_ok = latest and latest.get("date") == today and latest.get("status") != "failed"
        if not same_day_ok:  # 같은 날 이미 정상 브리핑이 있으면 실패 브리핑으로 덮지 않는다
            b = briefing.build_failed(date=today, now_iso=now_iso, message=message, previous_date=previous_date)
            write_json(data_dir / "briefing" / "latest.json", b)
            write_json(data_dir / "briefing" / "index.json", briefing.update_index(index, b), pretty=True)
        return EXIT_FAILED

    key = (env.get("MOLIT_API_KEY") or "").strip()
    if not key:
        return fail("MOLIT_API_KEY 가 설정되지 않아 실거래 자료를 조회하지 못했습니다.")

    yms = config.recent_yms(now, months or (config.DEFAULT_INITIAL_MONTHS if initial else config.DEFAULT_REFRESH_MONTHS))
    log(f"실거래 수집: {yms[0]} ~ {yms[-1]} ({len(yms)}개월, 지역코드 {', '.join(config.LAWD_CODES)})")

    # 1) 월별 수집·병합
    month_files: dict[str, dict] = {}
    for m in manifest.get("months", []):
        f = read_json(data_dir / "trades" / f"{m['ym']}.json")
        if f:
            month_files[m["ym"]] = f
    diff = Diff()
    lawd_counts: dict[str, int] = {}
    failed_months: list[str] = []
    updated: set[str] = set()
    for ym in yms:
        existing = (month_files.get(ym) or {}).get("trades", [])
        try:
            merged, d = collect_month(key, ym, existing, now_iso, fetch_month, log, counts=lawd_counts)
        except ApiError as e:
            if e.auth:
                return fail(str(e))
            log(f"  [월 실패] {e}")
            failed_months.append(ym)
            continue
        diff.extend(d)
        updated.add(ym)
        if merged or ym in month_files:
            month_files[ym] = {"ym": ym, "fetchedAt": now_iso, "source": config.SOURCE_TRADE, "trades": merged}
        log(f"  {ym}: {len(merged)}건 (신규 {len(d.new)}, 해제 전환 {len(d.cancelled)}, 미확인 {len(d.missing)})")

    if not updated:
        return fail(f"모든 달의 조회에 실패했습니다 ({len(failed_months)}개월).")
    all_trades = [t for f in month_files.values() for t in f["trades"]]
    if not all_trades:
        return fail("조회는 되었으나 거래가 0건입니다. 지역코드(SUNCHEON_LAWD_CODES)와 활용신청 상태를 확인하세요.")

    # 2) 전월세 (선택 — 실패해도 매매 반영은 계속)
    src = {s["id"]: s["status"] for s in manifest.get("sources", [])}
    rent_files: dict[str, dict] = {}
    for m in manifest.get("rentMonths", []):
        f = read_json(data_dir / "rents" / f"{m['ym']}.json")
        if f:
            rent_files[m["ym"]] = f
    rent_status = src.get("molit-rent", "pending")
    rent_updated: set[str] = set()
    rent_message = None
    if (env.get("RENT_ENABLED") or "1") != "0":
        rent_yms = yms if rent_files else config.recent_yms(now, months or config.DEFAULT_INITIAL_MONTHS)
        log(f"전월세 수집: {rent_yms[0]} ~ {rent_yms[-1]}")
        try:
            rent_updated, rent_failed, fatal = collect_rents(env.get("RENT_API_KEY") or key, rent_yms, rent_files,
                                                             now_iso, fetch_rent_month, log)
        except Exception as e:  # noqa: BLE001 — 선택 연계는 어떤 오류든 본 수집을 막지 않는다
            rent_updated, rent_failed, fatal = set(), [], str(e)
        if fatal or not rent_updated:
            rent_status = "failed"
            rent_message = fatal or "전월세 자료 조회에 실패했습니다."
            log(f"[경고] 전월세 조회 실패: {rent_message}")
        else:
            rent_status = "connected"
            if rent_failed:
                rent_message = f"전월세 일부 달({', '.join(rent_failed)})은 이전 자료를 유지했습니다."
    all_rents = [t for f in rent_files.values() for t in f["rents"]]

    # 3) 선택 연계: K-apt, 좌표, 분양 (실패해도 계속)
    geocache = read_json(cache_dir / "geocode.json", {})
    kaptcache = read_json(cache_dir / "kapt.json", {})

    kapt_status = src.get("kapt", "pending")
    if (env.get("KAPT_ENABLED") or "1") != "0":
        try:
            enrich.update_kapt_cache(kaptcache, env.get("KAPT_API_KEY") or key, now, get=get)
            kapt_status = "connected"
        except Exception as e:  # noqa: BLE001
            log(f"[경고] K-apt 기본정보 조회 실패: {e}")
            kapt_status = "failed" if not kaptcache.get("items") else kapt_status
        write_json(cache_dir / "kapt.json", kaptcache)
    base = stats.build_complexes(all_trades, {}, {}, all_rents)
    kapt_by_complex = enrich.match_kapt(base, kaptcache.get("items", {}))
    # 실거래가 없어 목록에 없던 단지도 K-apt 단지 목록으로 채운다
    kapt_only = enrich.unmatched_kapt(kaptcache.get("items", {}), kapt_by_complex)

    geo_status = src.get("kakao-geo", "pending")
    rest_key = (env.get("KAKAO_REST_API_KEY") or "").strip()
    if rest_key:
        try:
            enrich.geocode_complexes(stats.build_complexes(all_trades, {}, kapt_by_complex, all_rents, kapt_only),
                                     geocache, rest_key, now, get=get)
            geo_status = "connected"
        except Exception as e:  # noqa: BLE001
            log(f"[경고] 좌표 변환 실패: {e}")
            geo_status = "failed"
        write_json(cache_dir / "geocode.json", geocache)

    old_presales = read_json(data_dir / "presales.json") or {}
    presale_file = {"status": "pending", "fetchedAt": None, "message": None, "items": [], **old_presales,
                    "source": {"name": "한국부동산원 청약홈 분양정보 조회 서비스", "url": config.APPLYHOME_PAGE}}
    try:
        items = enrich.fetch_presales(env.get("APPLYHOME_API_KEY") or key, get=get)
        presale_file.update({"status": "ok", "fetchedAt": now_iso, "message": None, "items": items})
    except Exception as e:  # noqa: BLE001
        log(f"[경고] 청약홈 분양정보 조회 실패: {e}")
        presale_file.update({"status": "failed", "message": "청약홈 분양정보 조회에 실패했습니다. 활용신청 승인 여부를 확인하세요."})

    # 가격지수(R-ONE) — 별도 키(REB_API_KEY)가 있을 때만
    index_src = {"name": "한국부동산원 부동산통계(R-ONE) (월) 아파트 매매가격지수", "url": config.REB_PAGE}
    index_file = {"status": "pending", "fetchedAt": None, "message": None, "region": "전남광주>전남>순천시", "items": [],
                  **(read_json(data_dir / "stats" / "price-index.json") or {}), "source": index_src}
    reb_key = (env.get("REB_API_KEY") or "").strip()
    if reb_key:
        try:
            index_file.update({"status": "ok", "fetchedAt": now_iso, "message": None,
                               "items": enrich.fetch_price_index(reb_key, get=get)})
        except Exception as e:  # noqa: BLE001
            log(f"[경고] 가격지수 조회 실패: {e}")
            index_file.update({"status": "failed", "message": "한국부동산원 가격지수 조회에 실패했습니다."})

    # 학교 위치
    school_src = {"name": "전국초중등학교위치표준데이터", "url": config.SCHOOL_PAGE}
    school_file = {"status": "pending", "fetchedAt": None, "message": None, "items": [],
                   **(read_json(data_dir / "schools.json") or {}), "source": school_src}
    try:
        school_items = enrich.fetch_schools(env.get("SCHOOL_API_KEY") or key, get=get)
        if not school_items:
            raise ApiError("순천시 학교가 0건입니다.")
        school_file.update({"status": "ok", "fetchedAt": now_iso, "message": None, "items": school_items})
    except Exception as e:  # noqa: BLE001
        log(f"[경고] 학교 위치 조회 실패: {e}")
        school_file.update({"status": "failed", "message": "학교 위치 자료 조회에 실패했습니다. 활용신청 승인 여부를 확인하세요."})

    # 4) 산출물 생성 (스테이징)
    complexes = stats.build_complexes(all_trades, geocache, kapt_by_complex, all_rents, kapt_only)
    by_ym = {ym: f["trades"] for ym, f in month_files.items()}
    mstats = stats.month_stats(by_ym)
    last12 = config.recent_yms(now, 12)
    summary = {
        "generatedAt": now_iso,
        "months": mstats,
        "byDong": stats.dong_stats(all_trades, last12[0], last12[-1]),
        "recentTrades": stats.recent_trades(all_trades),
    }
    message = f"일부 달({', '.join(failed_months)}) 조회에 실패해 해당 달은 이전 자료를 유지했습니다." if failed_months else None
    same_day = latest if latest and latest.get("date") == today else None
    brief = briefing.build(
        date=today, now_iso=now_iso, diff=diff, initial=initial, total_stored=sum(1 for t in all_trades if is_active(t)),
        previous_date=previous_date, same_day=same_day, presales=presale_file["items"], zones=config.load_zones(),
        message=message)
    rent_months = [{"ym": ym, "count": sum(1 for t in f["rents"] if is_active(t)), "fetchedAt": f["fetchedAt"]}
                   for ym, f in sorted(rent_files.items())]
    new_manifest = {
        "schemaVersion": config.SCHEMA_VERSION,
        "status": "ok",
        "region": {"name": config.REGION_NAME, "lawdCd": config.PRIMARY_LAWD},
        "generatedAt": now_iso,
        "lastAttemptAt": now_iso,
        "lastAttemptStatus": "partial" if failed_months else "ok",
        "lastAttemptMessage": message,
        "months": [{"ym": s["ym"], "count": s["count"], "cancelled": s["cancelled"],
                    "fetchedAt": month_files[s["ym"]]["fetchedAt"]} for s in mstats],
        "rentMonths": rent_months,
        "rentMessage": rent_message,
        "totals": {
            "trades": sum(s["count"] for s in mstats),
            "cancelled": sum(s["cancelled"] for s in mstats),
            "complexes": len(complexes),
            "geocoded": sum(1 for c in complexes if c["lat"] is not None),
            "rents": sum(m["count"] for m in rent_months),
        },
        # 이번 실행에서 지역코드별로 받은 매매 건수(행정통합 전후 코드 확인용)
        "lawdCounts": lawd_counts,
        "sources": sources(trade="connected", kapt=kapt_status, geo=geo_status, rent=rent_status,
                           index="connected" if index_file["status"] == "ok" else index_file["status"],
                           school="connected" if school_file["status"] == "ok" else school_file["status"],
                           presale="connected" if presale_file["status"] == "ok" else presale_file["status"]),
    }
    log(f"지역코드별 매매 수신 건수: {lawd_counts}")

    # 같은 파일시스템 안에 두어야 os.replace 로 원자적 이동이 가능하다
    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=data_dir.parent))
    try:
        # 5) 검증
        for ym in updated:
            if ym in month_files:
                validate.validate_month(month_files[ym])
        for ym in rent_updated:
            if ym in rent_files:
                validate.validate_rent_month(rent_files[ym])
        validate.validate_complexes(complexes, {t["complexId"] for t in all_trades} | {t["complexId"] for t in all_rents})
        validate.validate_manifest(new_manifest, {s["ym"]: s["count"] for s in mstats})
        validate.validate_briefing(brief)

        for ym in updated:
            if ym in month_files:
                write_json(staging / "trades" / f"{ym}.json", month_files[ym])
        for ym in rent_updated:
            if ym in rent_files:
                write_json(staging / "rents" / f"{ym}.json", rent_files[ym])
        by_complex: dict[str, list[dict]] = {c["id"]: [] for c in complexes}  # 거래 없는 단지도 빈 파일을 둔다
        for t in all_trades:
            by_complex.setdefault(t["complexId"], []).append(t)
        for cid, lst in by_complex.items():
            lst.sort(key=lambda t: (t["dealDate"], t["price"]), reverse=True)
            write_json(staging / "by-complex" / f"{cid}.json",
                       {"complexId": cid, "generatedAt": now_iso, "source": config.SOURCE_TRADE, "trades": lst})
        if rent_updated:
            rent_by_complex: dict[str, list[dict]] = {}
            for t in all_rents:
                rent_by_complex.setdefault(t["complexId"], []).append(t)
            for cid, lst in rent_by_complex.items():
                lst.sort(key=lambda t: t["dealDate"], reverse=True)
                write_json(staging / "by-complex-rent" / f"{cid}.json",
                           {"complexId": cid, "generatedAt": now_iso, "source": config.SOURCE_RENT, "rents": lst})
        write_json(staging / "complexes.json", {"generatedAt": now_iso, "complexes": complexes})
        write_json(staging / "stats" / "summary.json", summary)
        write_json(staging / "presales.json", presale_file, pretty=True)
        write_json(staging / "stats" / "price-index.json", index_file)
        write_json(staging / "schools.json", school_file)
        write_json(staging / "briefing" / "latest.json", brief)
        write_json(staging / "briefing" / "archive" / f"{today}.json", brief)
        write_json(staging / "briefing" / "index.json", briefing.update_index(index, brief), pretty=True)
        write_json(staging / "manifest.json", new_manifest, pretty=True)  # 마지막에 반영되는 기준 파일
    except validate.ValidationError as e:
        shutil.rmtree(staging, ignore_errors=True)
        return fail(f"생성 데이터 검증 실패로 반영하지 않았습니다: {e}")

    # 6) 반영 — manifest.json 은 이름순으로도 trades/ 보다 앞이므로 따로 마지막에 옮긴다
    manifest_tmp = staging.parent / (staging.name + "-manifest.json")
    (staging / "manifest.json").replace(manifest_tmp)
    n = commit(staging, data_dir)
    manifest_tmp.replace(data_dir / "manifest.json")
    shutil.rmtree(staging, ignore_errors=True)
    log(f"[완료] 파일 {n + 1}개 반영 · 매매 {new_manifest['totals']['trades']:,}건 · 전월세 {new_manifest['totals']['rents']:,}건 · "
        f"단지 {len(complexes):,}개 · 좌표 {new_manifest['totals']['geocoded']:,}개 · 브리핑 상태 {brief['status']}")
    return EXIT_OK
