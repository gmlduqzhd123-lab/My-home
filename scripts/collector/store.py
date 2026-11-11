"""JSON 읽기·쓰기와 스테이징 반영."""
from __future__ import annotations

import json
import os
from pathlib import Path


def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, obj, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":"))
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text + "\n", encoding="utf-8")
    os.replace(tmp, path)


def commit(staging: Path, dest: Path) -> int:
    """검증을 통과한 스테이징 디렉터리의 파일을 운영 데이터 디렉터리로 옮긴다."""
    n = 0
    for src in sorted(staging.rglob("*.json")):
        target = dest / src.relative_to(staging)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(src, target)
        n += 1
    return n
