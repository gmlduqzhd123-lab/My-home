"""순천집 ZIP 데이터 수집 실행 스크립트.

사용법:
  python scripts/collect.py              # 수집(첫 실행 24개월, 이후 최근 12개월 재조회)
  python scripts/collect.py --months 24  # 재조회 개월 수 지정
  python scripts/collect.py --init       # 연결 대기 상태의 초기 파일만 생성

인증키는 환경변수(또는 프로젝트 루트의 .env)에서 읽는다. 종료 코드: 0 정상(부분 성공 포함), 3 조회 실패.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from collector import config, pipeline  # noqa: E402


def load_dotenv(path: Path) -> None:
    """간단한 .env 로더(이미 설정된 환경변수는 덮어쓰지 않음)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> int:
    for stream in (sys.stdout, sys.stderr):  # Windows 콘솔에서도 한글 로그가 깨지지 않게
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="순천시 아파트 실거래 공공데이터 수집")
    ap.add_argument("--months", type=int, help="현재 달 포함 재조회할 개월 수")
    ap.add_argument("--init", action="store_true", help="초기(연결 대기) 파일만 생성")
    args = ap.parse_args()

    load_dotenv(config.ROOT / ".env")
    if args.init:
        pipeline.init_data(config.DATA_DIR, config.now_kst())
        print(f"초기 파일 생성: {config.DATA_DIR}")
        return 0
    return pipeline.run(env=os.environ, months=args.months)


if __name__ == "__main__":
    sys.exit(main())
