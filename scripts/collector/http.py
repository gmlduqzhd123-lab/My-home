"""HTTP 호출 공통: 재시도, 인증키 마스킹."""
from __future__ import annotations

import time
import urllib.error
import urllib.parse
import urllib.request


class ApiError(Exception):
    """공공 API 호출·응답 오류. auth=True 면 인증키 문제(재시도 무의미)."""

    def __init__(self, message: str, *, auth: bool = False):
        super().__init__(message)
        self.auth = auth


def normalize_service_key(key: str) -> str:
    """포털이 주는 Encoding 키·Decoding 키 어느 쪽을 넣어도 동작하도록 '디코딩된 원문'으로 통일한다."""
    key = key.strip()
    return urllib.parse.unquote(key) if "%" in key else key


def mask(text: str, secrets: list[str]) -> str:
    for s in secrets:
        if not s:
            continue
        for v in {s, urllib.parse.quote(s, safe=""), urllib.parse.quote_plus(s)}:
            text = text.replace(v, "***")
    return text


def http_get(
    url: str,
    params: dict[str, str | int] | None = None,
    *,
    headers: dict[str, str] | None = None,
    secrets: list[str] | None = None,
    retries: int = 3,
    timeout: float = 30,
    backoff: float = 2.0,
    opener=urllib.request.urlopen,
    sleep=time.sleep,
) -> bytes:
    """GET 요청. 5xx·네트워크 오류는 지수 백오프로 재시도, 401/403 은 즉시 인증 오류."""
    secrets = secrets or []
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(full, headers={"User-Agent": "suncheon-zip-collector", **(headers or {})})
    last = ""
    for attempt in range(1, retries + 1):
        try:
            with opener(req, timeout=timeout) as res:
                return res.read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise ApiError(f"인증 실패(HTTP {e.code}). 인증키와 활용신청 승인 상태를 확인하세요.", auth=True) from None
            last = f"HTTP {e.code}"
            if e.code < 500 and e.code != 429:
                break
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last = mask(str(getattr(e, "reason", e)), secrets)
        if attempt < retries:
            sleep(backoff ** attempt)
    raise ApiError(f"요청 실패: {last}")
