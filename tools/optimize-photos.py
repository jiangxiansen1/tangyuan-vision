#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Re-export imported photos at a web-appropriate size.

WHY: the first import kept a 2560px long edge, which measured ~4 s per photo on
a real connection. The lightbox showed a placeholder long enough to read as
"broken". 1920px at quality 80 is visually indistinguishable in the viewer
(which already fits the image to the stage) and lands around 250-400KB.

Source of truth: the ORIGINAL files, matched by the title recorded at import
time, so this is a fresh export rather than a second lossy pass over the
already-resized copy. Falls back to the existing file when the original is gone.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTO_DIR = ROOT / "public" / "assets" / "photography"
PHOTO_JSON = ROOT / "src" / "content" / "data" / "photography.json"

MAX_SIDE = 1920
QUALITY = 80
THUMB_SIDE = 480
THUMB_QUALITY = 80


def find_original(origin_dir: Path, title: str) -> Path | None:
    """Match the recorded title back to the original file name."""
    candidates = [title.strip(), title.strip().rstrip(), title]
    for c in candidates:
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            p = origin_dir / f"{c}{ext}"
            if p.exists():
                return p
    # Loose match: any file whose stem starts with the title stem
    stem = title.strip()
    for p in origin_dir.rglob("*"):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and p.stem.strip() == stem:
            return p
    return None


def export(src: Path, photo_id: str):
    dst = PHOTO_DIR / f"{photo_id}.jpg"
    thumb = PHOTO_DIR / f"{photo_id}@thumb.jpg"
    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (5, 7, 10))
            rgba = img.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        img.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)

        t = img.copy()
        t.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.LANCZOS)
        t.save(thumb, "JPEG", quality=THUMB_QUALITY, optimize=True, progressive=True)
        return img.size, dst.stat().st_size


def main() -> int:
    origin_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    apply = "--apply" in sys.argv

    doc = json.loads(PHOTO_JSON.read_text(encoding="utf-8"))
    items = doc["items"]

    before = sum((PHOTO_DIR / Path(i["src"]).name).stat().st_size
                 for i in items
                 if i.get("provenance") == "real" and (PHOTO_DIR / Path(i["src"]).name).exists())

    rows = []
    for item in items:
        if item.get("provenance") != "real":
            continue
        photo_id = item["id"]
        existing = PHOTO_DIR / Path(item["src"]).name
        src = None
        how = "existing"
        if origin_dir and origin_dir.is_dir():
            found = find_original(origin_dir, item.get("title") or photo_id)
            if found:
                src = found
                how = "original"
        if src is None:
            src = existing
        if not src or not src.exists():
            rows.append((photo_id, "MISSING", None))
            continue

        if apply:
            (w, h), size = export(src, photo_id)
            item["width"] = w
            item["height"] = h
            rows.append((photo_id, how, size))
        else:
            with Image.open(src) as im:
                im = ImageOps.exif_transpose(im)
                w, h = im.size
            scale = min(1.0, MAX_SIDE / max(w, h))
            rows.append((photo_id, how, int(w * scale) * int(h * scale)))

    print(f"真实作品: {sum(1 for r in rows)}")
    for r in rows[:5]:
        print("  ", r)
    print("  ...")

    if apply:
        PHOTO_JSON.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        after = sum(f.stat().st_size for f in PHOTO_DIR.glob("*.jpg"))
        print(f"\n大图总大小: {before/1024/1024:.1f} MB -> {after/1024/1024:.1f} MB")
        print("已更新 photography.json 的尺寸字段")
    else:
        print("\n预演模式，未写入。加 --apply 执行。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
