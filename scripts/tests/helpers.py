"""테스트 공용: 가상 API 응답 생성기. 여기의 단지명·금액은 모두 테스트용 가상 값이다."""
from __future__ import annotations

from xml.sax.saxutils import escape


def item(apt="테스트단지", umd="왕지동", jibun="100", amount="32,500", y=2026, m=10, d=5, area="84.97", floor="7",
         build="2015", **extra) -> dict[str, str]:
    base = {
        "aptNm": apt, "umdNm": umd, "jibun": jibun, "dealAmount": amount,
        "dealYear": str(y), "dealMonth": str(m), "dealDay": str(d),
        "excluUseAr": area, "floor": floor, "buildYear": build,
        "dealingGbn": "중개거래", "cdealType": "", "cdealDay": "", "rgstDate": "",
        "aptDong": "", "slerGbn": "개인", "buyerGbn": "개인", "estateAgentSggNm": "순천시",
        "landLeaseholdGbn": "N", "sggCd": "12150", "umdCd": "10300", "bonbun": "0100", "bubun": "0000", "landCd": "1",
        "aptSeq": "12150-1", "roadNm": "왕지로",
    }
    base.update(extra)
    return base


def xml_response(items: list[dict[str, str]], total: int | None = None, code: str = "000", msg: str = "OK") -> bytes:
    rows = "".join("<item>" + "".join(f"<{k}>{escape(v)}</{k}>" for k, v in it.items()) + "</item>" for it in items)
    total = len(items) if total is None else total
    return (
        f'<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>{code}</resultCode>'
        f"<resultMsg>{msg}</resultMsg></header><body><items>{rows}</items><numOfRows>1000</numOfRows>"
        f"<pageNo>1</pageNo><totalCount>{total}</totalCount></body></response>"
    ).encode("utf-8")


def rent_item(apt="테스트단지", umd="왕지동", jibun="100", deposit="20,000", monthly="0", y=2026, m=10, d=5,
              area="84.97", floor="7", **extra) -> dict[str, str]:
    base = {
        "aptNm": apt, "umdNm": umd, "jibun": jibun, "deposit": deposit, "monthlyRent": monthly,
        "dealYear": str(y), "dealMonth": str(m), "dealDay": str(d), "excluUseAr": area, "floor": floor,
        "buildYear": "2015", "contractTerm": "26.10~28.10", "contractType": "신규", "useRRRight": "",
        "preDeposit": "", "preMonthlyRent": "", "sggCd": "12150",
    }
    base.update(extra)
    return base
