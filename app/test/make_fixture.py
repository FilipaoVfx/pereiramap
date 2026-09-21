"""Genera test/fixture_gps.jpg: un JPEG con EXIF GPS (Plaza de Bolívar, Pereira),
DateTimeOriginal y GPSImgDirection, a partir de un JPEG base sin metadatos.

Sin Pillow ni piexif: el bloque APP1/TIFF se arma a mano. Es un fixture de
prueba del lector EXIF y del re-codificador; no es una foto real.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

LAT, LON = 4.8143, -75.6946
WHEN = b"2026:09:18 14:32:10\x00"
OFFSET = b"-05:00\x00"
DIRECTION = 123.5


def dms(deg: float) -> list[tuple[int, int]]:
    deg = abs(deg)
    d = int(deg)
    m = int((deg - d) * 60)
    s = round(((deg - d) * 60 - m) * 60 * 1000)
    return [(d, 1), (m, 1), (s, 1000)]


def ifd(entries: list[tuple[int, int, int, bytes]], base: int) -> tuple[bytes, bytes]:
    """entries: (tag, type, count, value_bytes). Devuelve (ifd_bytes, data_bytes)
    con los valores largos colocados después del IFD, empezando en `base`."""
    n = len(entries)
    ifd_len = 2 + n * 12 + 4
    data = b""
    out = struct.pack("<H", n)
    for tag, typ, count, value in entries:
        if len(value) <= 4:
            out += struct.pack("<HHI", tag, typ, count) + value.ljust(4, b"\x00")
        else:
            out += struct.pack("<HHII", tag, typ, count, base + ifd_len + len(data))
            data += value
    out += struct.pack("<I", 0)
    return out, data


def rationals(values: list[tuple[int, int]]) -> bytes:
    return b"".join(struct.pack("<II", a, b) for a, b in values)


def build_exif() -> bytes:
    tiff_header = b"II*\x00" + struct.pack("<I", 8)
    # IFD0 en 8, con dos punteros; sus IFDs van después.
    ifd0_len = 2 + 2 * 12 + 4
    exif_off = 8 + ifd0_len
    exif_entries = [
        (0x9003, 2, len(WHEN), WHEN),
        (0x9011, 2, len(OFFSET), OFFSET),
    ]
    exif_ifd, exif_data = ifd(exif_entries, exif_off)
    gps_off = exif_off + len(exif_ifd) + len(exif_data)
    gps_entries = [
        (0x0001, 2, 2, b"N\x00" if LAT >= 0 else b"S\x00"),
        (0x0002, 5, 3, rationals(dms(LAT))),
        (0x0003, 2, 2, b"E\x00" if LON >= 0 else b"W\x00"),
        (0x0004, 5, 3, rationals(dms(LON))),
        (0x0010, 2, 2, b"T\x00"),
        (0x0011, 5, 1, rationals([(int(DIRECTION * 10), 10)])),
    ]
    gps_ifd, gps_data = ifd(gps_entries, gps_off)
    ifd0, _ = ifd(
        [(0x8769, 4, 1, struct.pack("<I", exif_off)), (0x8825, 4, 1, struct.pack("<I", gps_off))],
        8,
    )
    tiff = tiff_header + ifd0 + exif_ifd + exif_data + gps_ifd + gps_data
    payload = b"Exif\x00\x00" + tiff
    return b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload


def main(base: Path, out: Path) -> None:
    raw = base.read_bytes()
    assert raw[:2] == b"\xff\xd8", "no es JPEG"
    out.write_bytes(raw[:2] + build_exif() + raw[2:])
    print(out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
