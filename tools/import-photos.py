#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
import-photos.py — 批量把照片导入「摄影作品」与「地球 Online 进度」。

WHY THIS EXISTS
  一张照片的拍摄位置是可以从文件里**读出来**的（EXIF GPS），不需要猜、也不
  应该由模型凭画面推断。这个脚本只相信文件里真实存在的数据：

    · 有 GPS         → 写入 travels.json 的 latitude/longitude，并按真实经纬度
                       用本地 Natural Earth 边界判定属于哪个国家（ISO 数字码），
                       生成一条 status=visited 的旅行记录。
    · 没有 GPS       → 仍然导入摄影作品，但**绝不生成地球记录**，并在报告里
                       单独列出，让你自己决定要不要补坐标。

  「猜一个大概位置」会让地球进度变成假的，所以这个脚本不猜。

数据来源
  src/features/earth/data/countries-110m.json  TopoJSON，177 国，delta 编码，
  与站点地图判定用的是同一份数据 —— 所以照片落点和点击地图得到的结果一致。

用法
  # 先看报告，什么都不写
  python tools/import-photos.py "C:\\Users\\pc\\Pictures\\待导入"

  # 确认无误后真正写入
  python tools/import-photos.py "C:\\Users\\pc\\Pictures\\待导入" --apply

  # 顺便把占位用的示例作品从列表里移除
  python tools/import-photos.py <dir> --apply --replace-samples

输出
  public/assets/photography/<id>.jpg          原图（统一转 JPG，保留方向）
  public/assets/photography/<id>@thumb.jpg    缩略图（长边 480）
  src/content/data/photography.json           追加作品条目
  src/content/data/travels.json               追加有 GPS 的旅行记录
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("需要 Pillow：用 DSH 自带的 Python（含 Pillow 12）运行本脚本。")

ROOT = Path(__file__).resolve().parent.parent
PHOTO_DIR = ROOT / "public" / "assets" / "photography"
PHOTO_JSON = ROOT / "src" / "content" / "data" / "photography.json"
TRAVELS_JSON = ROOT / "src" / "content" / "data" / "travels.json"
COUNTRIES = ROOT / "src" / "features" / "earth" / "data" / "countries-110m.json"

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

# --------------------------------------------------------------------------- #
#  Natural Earth TopoJSON → 国家判定
# --------------------------------------------------------------------------- #

def load_countries():
    """把 TopoJSON 解成 [(iso_numeric, name_en, [ring, ...]), ...]。

    TopoJSON 的 arcs 是**量化 + delta 编码**的：先按顺序累加得到量化坐标，再乘
    scale 加 translate 得到真实经纬度。负索引 ~i 表示第 i 条 arc 的反向。
    """
    topo = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    scale = topo["transform"]["scale"]
    translate = topo["transform"]["translate"]

    arcs = []
    for arc in topo["arcs"]:
        pts = []
        x = y = 0
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append([x * scale[0] + translate[0], y * scale[1] + translate[1]])
        arcs.append(pts)

    def ring_from(arc_indices):
        out = []
        for idx in arc_indices:
            part = list(reversed(arcs[~idx])) if idx < 0 else arcs[idx]
            out.extend(part[1:] if out else part)
        return out

    countries = []
    for geom in topo["objects"]["countries"]["geometries"]:
        iso = str(geom.get("id") or "")
        name = (geom.get("properties") or {}).get("name") or ""
        rings = []
        if geom["type"] == "Polygon":
            rings = [ring_from(r) for r in geom["arcs"]]
        elif geom["type"] == "MultiPolygon":
            rings = [ring_from(r) for poly in geom["arcs"] for r in poly]
        countries.append((iso, name, rings))
    return countries


def point_in_ring(lon, lat, ring):
    """射线法。返回 True 表示点在环内。"""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def lookup_country(countries, lon, lat):
    """返回 (iso_numeric, name_en) 或 (None, None)。"""
    for iso, name, rings in countries:
        for ring in rings:
            if point_in_ring(lon, lat, ring):
                return iso, name
    return None, None


# --------------------------------------------------------------------------- #
#  EXIF
# --------------------------------------------------------------------------- #

GPS_IFD = 0x8825
EXIF_IFD = 0x8769

TAG_DATETIME = 306
TAG_MAKE = 271
TAG_MODEL = 272
TAG_DATETIME_ORIGINAL = 36867
TAG_LENS = 42036
TAG_FNUMBER = 33437
TAG_EXPOSURE = 33434
TAG_ISO = 34855
TAG_FOCAL = 37386


def _ratio(value):
    try:
        if isinstance(value, tuple) and len(value) == 2:
            num, den = value
            return float(num) / float(den) if den else None
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _dms_to_deg(dms, ref):
    try:
        deg = _ratio(dms[0])
        minute = _ratio(dms[1])
        sec = _ratio(dms[2])
        if deg is None or minute is None or sec is None:
            return None
        value = deg + minute / 60.0 + sec / 3600.0
        if ref in ("S", "W"):
            value = -value
        return value
    except (IndexError, TypeError):
        return None


def read_exif(path: Path):
    """读出真实存在于文件里的字段。缺失的都返回 None，绝不编造。"""
    info = {
        "taken_at": None,
        "make": None,
        "model": None,
        "lens": None,
        "fnumber": None,
        "exposure": None,
        "iso": None,
        "focal": None,
        "lat": None,
        "lon": None,
        "size": None,
    }
    with Image.open(path) as img:
        info["size"] = img.size
        try:
            exif = img.getexif()
        except Exception:
            return info, img.size

        if not exif:
            return info, img.size

        raw_dt = exif.get(TAG_DATETIME)
        info["make"] = (exif.get(TAG_MAKE) or "").strip() or None
        info["model"] = (exif.get(TAG_MODEL) or "").strip() or None

        try:
            sub = exif.get_ifd(EXIF_IFD) or {}
        except Exception:
            sub = {}

        dt = sub.get(TAG_DATETIME_ORIGINAL) or raw_dt
        if dt:
            text = str(dt).strip()
            for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
                try:
                    info["taken_at"] = datetime.strptime(text[:19], fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue

        info["lens"] = (sub.get(TAG_LENS) or None)
        if isinstance(info["lens"], bytes):
            info["lens"] = info["lens"].decode("utf-8", "ignore").strip() or None
        info["fnumber"] = _ratio(sub.get(TAG_FNUMBER))
        info["exposure"] = _ratio(sub.get(TAG_EXPOSURE))
        iso = sub.get(TAG_ISO)
        if isinstance(iso, (list, tuple)) and iso:
            iso = iso[0]
        try:
            info["iso"] = int(iso) if iso is not None else None
        except (TypeError, ValueError):
            info["iso"] = None
        info["focal"] = _ratio(sub.get(TAG_FOCAL))

        try:
            gps = exif.get_ifd(GPS_IFD) or {}
        except Exception:
            gps = {}

        if gps:
            lat = _dms_to_deg(gps.get(2), gps.get(1))
            lon = _dms_to_deg(gps.get(4), gps.get(3))
            # (0,0) 是「空值岛」，不是真实拍摄点，按无 GPS 处理
            if lat is not None and lon is not None and not (abs(lat) < 1e-6 and abs(lon) < 1e-6):
                info["lat"] = round(lat, 6)
                info["lon"] = round(lon, 6)

    return info, info["size"]


# --------------------------------------------------------------------------- #
#  导出
# --------------------------------------------------------------------------- #

def slugify(text: str) -> str:
    keep = []
    for ch in text.lower():
        if ch.isalnum() and ord(ch) < 128:
            keep.append(ch)
        elif ch in " -_":
            keep.append("-")
    slug = "".join(keep).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "photo"


def export_image(src: Path, photo_id: str):
    """统一导出为 JPG（应用 EXIF 方向），并生成缩略图。返回 (宽, 高)。"""
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    dst = PHOTO_DIR / f"{photo_id}.jpg"
    thumb = PHOTO_DIR / f"{photo_id}@thumb.jpg"

    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (5, 7, 10))
            img_rgba = img.convert("RGBA")
            bg.paste(img_rgba, mask=img_rgba.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        img.save(dst, "JPEG", quality=90, optimize=True, progressive=True)

        t = img.copy()
        t.thumbnail((480, 480), Image.LANCZOS)
        t.save(thumb, "JPEG", quality=82, optimize=True, progressive=True)

        return img.size


def camera_label(info) -> str | None:
    """相机标签：只拼接真实存在的字段。"""
    parts = []
    if info.get("make") and info.get("model"):
        model = info["model"]
        # 常见情况：Model 里已经包含厂商名，避免 "Canon Canon EOS R5"
        if info["make"].split()[0].lower() not in model.lower():
            parts.append(f'{info["make"]} {model}')
        else:
            parts.append(model)
    elif info.get("model"):
        parts.append(info["model"])

    lens = info.get("lens")
    if lens:
        parts.append(lens)

    exposure = []
    if info.get("focal"):
        exposure.append(f'{info["focal"]:.0f}mm')
    if info.get("fnumber"):
        exposure.append(f'f/{info["fnumber"]:.1f}')
    if info.get("exposure"):
        s = info["exposure"]
        exposure.append(f"1/{round(1/s)}s" if s < 1 else f"{s:g}s")
    if info.get("iso"):
        exposure.append(f'ISO {info["iso"]}')
    if exposure:
        parts.append(" ".join(exposure))

    return " · ".join(parts) if parts else None


# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description="批量导入照片到摄影作品与地球记录")
    ap.add_argument("directory", help="照片所在目录")
    ap.add_argument("--apply", action="store_true", help="真正写入文件（默认只出报告）")
    ap.add_argument("--replace-samples", action="store_true", help="删除 provenance=sample 的示例作品")
    ap.add_argument("--category", default="landscape", choices=["landscape", "portrait", "other"])
    ap.add_argument("--title-prefix", default="", help="标题前缀，例如日期或地名")
    args = ap.parse_args()

    src_dir = Path(args.directory)
    if not src_dir.is_dir():
        return print(f"目录不存在：{src_dir}") or 2

    files = sorted(p for p in src_dir.rglob("*") if p.suffix.lower() in SUPPORTED)
    if not files:
        return print(f"这个目录里没有可导入的图片：{src_dir}") or 2

    countries = load_countries()
    photos_doc = json.loads(PHOTO_JSON.read_text(encoding="utf-8"))
    travels_doc = json.loads(TRAVELS_JSON.read_text(encoding="utf-8"))
    photos = photos_doc["items"] if isinstance(photos_doc, dict) else photos_doc
    travels = travels_doc["items"] if isinstance(travels_doc, dict) else travels_doc

    existing_ids = {p.get("id") for p in photos}
    by_region = {t.get("regionId"): t for t in travels}

    # 同一天同一国家的照片，合并到同一条旅行记录里，而不是一个国家几十条
    pending_by_region = {}

    imported, skipped, no_gps = [], [], []
    order_base = max([p.get("order") or 0 for p in photos] or [0])

    for idx, path in enumerate(files, start=1):
        try:
            info, size = read_exif(path)
        except Exception as exc:
            skipped.append((path.name, f"读不了：{exc}"))
            continue

        taken = info["taken_at"] or "0000-00-00"
        base = f"{taken}-{slugify(path.stem)[:28]}"
        photo_id = base
        n = 2
        while photo_id in existing_ids:
            photo_id = f"{base}-{n}"
            n += 1
        existing_ids.add(photo_id)

        width, height = size
        title = (args.title_prefix + path.stem).strip()

        entry = {
            "id": photo_id,
            "title": title,
            "category": args.category,
            "src": f"/assets/photography/{photo_id}.jpg",
            "thumb": f"/assets/photography/{photo_id}@thumb.jpg",
            "width": int(width),
            "height": int(height),
            "description": "",
            "tone": "#2b3a4a",
            "feature": False,
            "order": order_base + idx,
            "provenance": "real",
        }
        cam = camera_label(info)
        if cam:
            entry["camera"] = cam
        if info["taken_at"]:
            entry["takenAt"] = info["taken_at"]

        iso, cname = (None, None)
        if info["lat"] is not None and info["lon"] is not None:
            iso, cname = lookup_country(countries, info["lon"], info["lat"])
            entry["location"] = cname or f'{info["lat"]:.4f}, {info["lon"]:.4f}'
            pending_by_region.setdefault(iso or "unknown", []).append(
                {
                    "photoId": photo_id,
                    "lat": info["lat"],
                    "lon": info["lon"],
                    "date": info["taken_at"],
                    "country": cname,
                }
            )
        else:
            no_gps.append((path.name, width, height))

        if args.apply:
            try:
                real_w, real_h = export_image(path, photo_id)
                entry["width"], entry["height"] = int(real_w), int(real_h)
            except Exception as exc:
                skipped.append((path.name, f"导出失败：{exc}"))
                continue

        photos.append(entry)
        imported.append(
            {
                "id": photo_id,
                "file": path.name,
                "size": f"{width}x{height}",
                "takenAt": info["taken_at"],
                "camera": cam,
                "gps": (info["lat"], info["lon"]) if info["lat"] is not None else None,
                "country": cname,
                "iso": iso,
            }
        )

    # ---- 生成旅行记录 ----
    new_travels = []
    for iso, shots in pending_by_region.items():
        if iso == "unknown":
            continue
        shots.sort(key=lambda s: (s["date"] or "9999", s["photoId"]))
        first = shots[0]
        if iso in by_region:
            record = by_region[iso]
            ids = list(dict.fromkeys((record.get("photoIds") or []) + [s["photoId"] for s in shots]))
            record["photoIds"] = ids
            record["status"] = "visited"
            if not record.get("latitude"):
                record["latitude"] = first["lat"]
                record["longitude"] = first["lon"]
            if not record.get("visitedAt") and first["date"]:
                record["visitedAt"] = first["date"]
            record["published"] = True
        else:
            record = {
                "regionId": iso,
                "status": "visited",
                "title": None,
                "visitedAt": first["date"],
                "story": None,
                "photoIds": [s["photoId"] for s in shots],
                "latitude": first["lat"],
                "longitude": first["lon"],
                "published": True,
            }
            travels.append(record)
            by_region[iso] = record
        new_travels.append(
            {
                "regionId": iso,
                "country": first["country"],
                "photos": len(shots),
                "visitedAt": record.get("visitedAt"),
                "lat": record.get("latitude"),
                "lon": record.get("longitude"),
            }
        )

    if args.replace_samples:
        before = len(photos)
        photos = [p for p in photos if p.get("provenance") != "sample"]
        removed = before - len(photos)
    else:
        removed = 0

    # ---- 报告 ----
    print("=" * 74)
    print(f"扫描目录：{src_dir}")
    print(f"图片文件：{len(files)}   可导入：{len(imported)}   跳过：{len(skipped)}")
    print("=" * 74)

    if imported:
        print("\n【导入清单】")
        for row in imported:
            gps = f'{row["gps"][0]:.4f}, {row["gps"][1]:.4f}' if row["gps"] else "无 GPS"
            country = row["country"] or "—"
            print(f'  {row["id"]}')
            print(f'    文件 {row["file"]}   {row["size"]}   拍摄 {row["takenAt"] or "未知"}')
            print(f'    GPS  {gps}   国家 {country} (ISO {row["iso"] or "?"})')
            if row["camera"]:
                print(f'    器材 {row["camera"]}')

    if new_travels:
        print("\n【写入地球记录】")
        for t in new_travels:
            print(f'  国家 ISO {t["regionId"]}  {t["country"]}  {t["photos"]} 张  '
                  f'{t["visitedAt"] or ""}  ({t["lat"]:.4f}, {t["lon"]:.4f})')

    if no_gps:
        print("\n【没有 GPS 的照片 —— 只进摄影作品，不上地球】")
        for name, w, h in no_gps:
            print(f"  {name}  {w}x{h}")
        print("  想放到地球上，就在 CMS 的「摄影作品」里补 location，")
        print("  再到「地球与旅行」填 latitude / longitude。脚本不猜位置。")

    if skipped:
        print("\n【跳过】")
        for name, why in skipped:
            print(f"  {name}  {why}")

    if removed:
        print(f"\n已移除 {removed} 条示例作品（provenance=sample）")

    if not args.apply:
        print("\n" + "-" * 74)
        print("这是预演，没有写任何文件。确认无误后加 --apply 真正导入。")
        return 0

    PHOTO_JSON.write_text(
        json.dumps({"items": photos}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    travels_doc["items"] = travels
    TRAVELS_JSON.write_text(
        json.dumps(travels_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("\n已写入：")
    print(f"  {PHOTO_JSON.relative_to(ROOT)}  （{len(photos)} 条）")
    print(f"  {TRAVELS_JSON.relative_to(ROOT)}  （{len(travels)} 条）")
    print(f"  {PHOTO_DIR.relative_to(ROOT)}\\")
    return 0


if __name__ == "__main__":
    sys.exit(main())
