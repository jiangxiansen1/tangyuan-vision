#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Backfill real GPS coordinates onto imported photographs.

The first import stored the resolved country as `location` but not the raw fix.
The globe needs the fix itself to place a thumbnail where the photo was taken, so
this re-reads it from the ORIGINAL files (matched by the recorded title) and adds
latitude/longitude. Nothing is estimated: a photo without a fix stays without one.
"""
from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PHOTO_JSON = ROOT / "src" / "content" / "data" / "photography.json"

GPS_IFD = 0x8825


def ratio(v):
    try:
        if isinstance(v, tuple) and len(v) == 2:
            return float(v[0]) / float(v[1]) if v[1] else None
        return float(v)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def dms(value, ref):
    try:
        d = ratio(value[0]); m = ratio(value[1]); s = ratio(value[2])
        if d is None or m is None or s is None:
            return None
        out = d + m / 60.0 + s / 3600.0
        return -out if ref in ("S", "W") else out
    except (IndexError, TypeError):
        return None


def read_gps(path: Path):
    with Image.open(path) as img:
        exif = img.getexif()
        if not exif:
            return None
        gps = exif.get_ifd(GPS_IFD) or {}
        if not gps:
            return None
        lat = dms(gps.get(2), gps.get(1))
        lon = dms(gps.get(4), gps.get(3))
        if lat is None or lon is None:
            return None
        if abs(lat) < 1e-6 and abs(lon) < 1e-6:
            return None
        return round(lat, 6), round(lon, 6)


def find_original(origin: Path, title: str):
    for c in (title.strip(), title.strip().rstrip(), title):
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            p = origin / f"{c}{ext}"
            if p.exists():
                return p
    stem = title.strip()
    for p in origin.rglob("*"):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and p.stem.strip() == stem:
            return p
    return None


def main() -> int:
    if len(sys.argv) < 2:
        return print("用法: backfill-photo-gps.py <原始照片目录> [--apply]") or 2
    origin = Path(sys.argv[1])
    apply = "--apply" in sys.argv

    doc = json.loads(PHOTO_JSON.read_text(encoding="utf-8"))
    found, missing, nofix = [], [], []

    for item in doc["items"]:
        if item.get("provenance") != "real":
            continue
        src = find_original(origin, item.get("title") or item["id"])
        if not src:
            missing.append(item["id"])
            continue
        gps = read_gps(src)
        if not gps:
            nofix.append(item["id"])
            continue
        found.append((item["id"], gps))
        if apply:
            item["latitude"] = gps[0]
            item["longitude"] = gps[1]

    print(f"有 GPS: {len(found)}   无 GPS: {len(nofix)}   找不到原图: {len(missing)}")
    for pid, gps in found[:4]:
        print(f"  {pid}  {gps[0]:.4f}, {gps[1]:.4f}")
    if nofix:
        print("  无 GPS:", ", ".join(nofix))

    if apply:
        PHOTO_JSON.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("已写入 photography.json")
    else:
        print("预演，未写入。加 --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
