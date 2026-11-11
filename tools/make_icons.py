"""PWA 아이콘(PNG) 생성 — 표준 라이브러리만 사용. favicon.svg 와 같은 도형(남색 바탕 + 청록 집)."""
import struct
import zlib
from pathlib import Path

MAIN, ACCENT = (0x14, 0x23, 0x3B), (0x00, 0xA8, 0x8F)
# 64 단위 좌표의 집 모양 다각형 (favicon.svg 의 path 와 동일)
HOUSE = [(32, 13), (12, 30), (18, 30), (18, 50), (28, 50), (28, 38), (36, 38), (36, 50), (46, 50), (46, 30), (52, 30)]


def inside(x: float, y: float) -> bool:
    hit = False
    n = len(HOUSE)
    for i in range(n):
        x1, y1 = HOUSE[i]
        x2, y2 = HOUSE[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def png(size: int) -> bytes:
    rows = bytearray()
    scale = 64 / size
    for py in range(size):
        rows.append(0)
        for px in range(size):
            # 2x2 슈퍼샘플링
            cov = sum(inside((px + dx) * scale, (py + dy) * scale) for dx in (0.25, 0.75) for dy in (0.25, 0.75)) / 4
            rows += bytes(round(MAIN[i] * (1 - cov) + ACCENT[i] * cov) for i in range(3))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "public"
    for s in (192, 512):
        (out / f"icon-{s}.png").write_bytes(png(s))
        print(f"icon-{s}.png")
