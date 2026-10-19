# 批量添加照片：完整流程

本文只讲**怎么做**。设计理由见 `docs/PHOTOS-AND-BACKDROP.md`。

---

## 0. 一句话版本

```powershell
# 把照片放进一个文件夹，然后：
& $PY tools\import-photos.py "C:\你的文件夹" --apply
git add -A; git commit -m "photos: 新增一批"; git push
```

推送后 GitHub Actions 自动构建部署，约 2-3 分钟线上生效。

---

## 1. 准备照片文件夹

脚本按**文件夹名**判断分类，所以这样摆最省事：

```
C:\Users\pc\Pictures\待导入\
├── 风光\           → category: landscape
│   ├── L001.jpg
│   └── L002.jpg
├── 人像\           → category: portrait
│   ├── P001.jpg
│   └── P002.jpg
└── 零散的.jpg       → 用 --category 的默认值（landscape）
```

- 中英文文件夹名都认：`风光` / `风景` / `landscape`，`人像` / `portrait`
- 多层嵌套也认：`旅行\2026云南\风光\x.jpg` 会正确归到 landscape
- 支持 `jpg / jpeg / png / webp / heic`（heic 需要系统解码器）

**照片必须是原图**（相机或手机导出的文件）。脚本要从 EXIF 读三样东西：

| 读什么 | 用在哪 | 读不到会怎样 |
|---|---|---|
| 拍摄时间 | 排序、灯箱显示 | 用文件修改时间兜底 |
| **GPS 坐标** | **地球上的照片位置 + 按省归集** | **照片不会有地图位置，也不会出现在任何省份里** |
| 相机型号/焦距/光圈/快门/ISO | 灯箱信息栏 | 该字段留空 |

> ⚠️ 微信、QQ、微博发过的图片会被剥离 EXIF，**坐标和拍摄时间都会丢**。一定要用原始文件。

---

## 2. 先空跑一次（不写文件）

```powershell
& $PY tools\import-photos.py "C:\Users\pc\Pictures\待导入"
```

输出会列出每张照片的**分类、尺寸、拍摄时间**，以及总数量。**这一步不改任何文件**，用来确认：

- 张数对得上
- 分类是对的（风光/人像）
- 拍摄时间不是一片"未知"（否则说明 EXIF 丢了）

---

## 3. 正式导入

```powershell
& $PY tools\import-photos.py "C:\Users\pc\Pictures\待导入" --apply
```

它做四件事：

1. 把照片**重新导出**成长边 1920px、质量 80 的成品图 → `public/assets/photography/`
2. 同时生成 480px 缩略图（`@thumb`）→ 灯箱胶片带和地球缩略图用
3. 写入 `src/content/data/photography.json`（标题、尺寸、分类、时间、GPS、相机信息）
4. 每张照片带 `provenance: "real"`

**已经有原图的老照片不会重复导入**（按文件名+时间判重）。

---

## 4. 只想重新压缩、不新增

如果你后来觉得图片太大想重新压一遍：

```powershell
& $PY tools\optimize-photos.py
```

它从**原始素材目录**按标题重新读取原图，重新导出 1920px / 质量 80。已经是最新的会跳过。

---

## 5. 提交并上线

```powershell
git add -A
git commit -m "photos: 新增 N 张"
git push
```

推送后：
- GitHub Actions 自动跑（约 2-3 分钟）
- 完成后 https://jiangxiansen1.github.io/tangyuan-vision/photography 就能看到
- 地球上的照片点、省份归集**自动跟着更新**，不需要改代码

---

## 6. 照片会出现在哪里

| 位置 | 显示条件 |
|---|---|
| 摄影页 `/photography` | 全部照片 |
| 地球上的缩略图 | 缩放距离 < 2.4，**每张照片一个点**，位置 = GPS 真实坐标 |
| 省份详情面板 | 选中省份后，列出**该省范围内**的全部照片（按 GPS 判定） |
| 灯箱大图 | 点击摄影页任意照片，或点击省份面板里的缩略图 |

**归省的规则**：用照片自己的 GPS 坐标对省份多边形做点在多边形判定。

- 在云南省范围内 → 出现在云南面板
- 在海南省范围内 → 出现在海南面板
- **没有 GPS 的照片不会出现在任何省份**（宁可不显示，也不猜）

---

## 7. 常见问题

**Q：导入后地球上看不到照片点？**
A：先放大地球（滚轮往下滚到距离 < 2.4）。远景时不显示照片点是有意的 —— 世界尺度上几十个缩略图会糊成一片。

**Q：某张照片不在任何省份里？**
A：它没有 GPS，或者坐标落在省界外（比如海上、境外）。检查原图是否保留了 EXIF。

**Q：照片位置看起来偏了几公里？**
A：地球是球面点云，在低缩放级别下列表位置有像素级误差；坐标本身是精确的 EXIF 值，灯箱里显示的地点也来自同一坐标。

**Q：想改某张照片的标题/描述/地点？**
A：用后台 CMS（`/admin/`）编辑「摄影作品」，或者直接改 `src/content/data/photography.json`。

**Q：想删照片？**
A：从 `photography.json` 里删掉那条记录，并删除 `public/assets/photography/` 下对应的两个文件。用 CMS 删更省事。

**Q：一次能加多少张？**
A：没有硬限制，但注意仓库体积。当前 32 张 1920px 成品约 11 MB。如果加到几百张，建议改用图床（Cloudflare R2 / 又拍云），否则 GitHub Pages 的 1GB 仓库上限迟早会碰到。
