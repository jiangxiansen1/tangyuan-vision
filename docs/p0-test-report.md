# p0-test-report.md — P0 测试报告（2026-10-11）

> ⚠️ **历史记录（产品方向已变更）**：本文提到的点赞 / 收藏 / 投票 / Supabase 访客互动
> 已从本项目移除（见 `docs/scene-architecture.md §Q`）。仅作历史留存，不代表现行需求或现行实现。


环境：Windows / Edge 155 headless（经 `tools/cdp.cjs` 零依赖 CDP 驱动）/ Node v24.19.0。
沙箱限制实测：沙箱内进程读取 `node_modules` 包内容返回 EPERM（ACL/完整性级别所致），
故 dev server、decap-server、tsc/vite 构建均在**沙箱外**执行（已逐次申请批准）。
产物目录：`tools/_verify/cms/`、`tools/_verify/p0c/`、`tools/_verify/p0e/`（gitignore，不入库）。

## P0-A 基线

| 命令 | 结果 |
|---|---|
| `git status -b` / `git log -n 5` | master@50411f9；仅 4 份第二阶段文档 untracked；无其他会话源码改动 |
| 四文档存在性 | AGENTS.md 10164B / design-brief 14465B / scene-architecture 7163B→9762B / implementation-plan 7010B→5855B（本阶段更新） |
| 水印白.png（D:/素材/水印/） | 2508×1672 PNG colorType 6；自写最小解码器实测 alpha：0→248044、255→14042、中间值 0（**真二值透明，无抗锯齿**）；旧 JPG 源仍在 |

## P0-B CMS

| 步骤 | 命令/工具 | 结果 |
|---|---|---|
| 端口与进程 | Get-NetTCPConnection | 8081/5183 初始空闲 |
| pnpm 直启 | `pnpm cms` / `pnpm dev` | ⛔ 触发"删除 node_modules 重装"交互确认（PATH pnpm 11.25.0 ≠ 安装者 11.8.0）；已终止挂起进程，未回答 Y |
| 服务启动 | `node_modules\.bin\decap-server.CMD`、`vite.CMD`（沙箱外） | ✅ 8081/5183 监听 |
| 沙箱读 node_modules | node readFileSync | ⛔ EPERM（包目录）；沙箱外 ✅ → 定性为沙箱限制 |
| admin 加载 | CDP probe `cms-admin.cjs` | dev 下 `/admin/` 被 SPA fallback 抢占（渲染站内 404）；`/admin/index.html` 才是后台 |
| backend local | 同上 | ⛔ "Backend not found: local"；bundle 3.8.4/3.9.0/3.12.0/latest 均只注册 …/proxy，无 local |
| 官方依据 | decap-server README（GitHub raw） | 本地后端 = `name: proxy` + `proxy_url: http://localhost:8081/api/v1` |
| 临时 proxy 配置 E2E | `cms-admin.cjs save` | ✅ 登录→集合→编辑器读到现宣言→改宣言+latin→发布→立即发布→磁盘写入；必填校验曾拦下空 latin（清晰中文报错）；Decap 保留 schema 外键 |
| 构建含内容 | `tsc -b` + `vite build`（沙箱外）+ grep dist | ✅ 测试串出现在 dist/assets/index-*.js |
| 恢复 | 备份还原 + 重建 | ✅ git diff 空；dist 测试串消失 |
| 在线方案调研 | 官方文档 fetch（github-backend / turbo-* / external-oauth-clients / 产品页 pricing） | Turbo=public preview+beta bundle+Free €0(1站1席永久)/Pro €19(预览期免费至 2026-10-15)；github 后端需自建 relay 或 Netlify；relay 清单为社区维护 |

## P0-C 地球

| 探针 | 结果 |
|---|---|
| `earth-p0c.cjs normal` | ✅ maplibregl-canvas 1400×651；HUD "z1.6 ｜ NASA 卫星影像（公有领域）"；统计 0/0/174；截图确认中国及东亚初始视角与昼夜分界 |
| `earth-p0c.cjs offline`（Fetch 拦截除 127.0.0.1 外全部请求） | 🟡 页面与 chrome 正常、区域数据可用，但球面全黑无影像；EarthGlobe 回退**未**触发（onFail 不覆盖瓦片失败）→ P4 修复项 |
| 审计 | MapGlobe：HOME_VIEW [104,24] z1.6、minZoom0/maxZoom17、ref current()/jumpTo()、map.remove() 处置；EarthGlobe：geometry/material/renderer/rAF 全处置；travels.json 空且 schema 完整；**config.yml 无 travels 集合** |

## P0-D 摄影/路由/彩蛋

| 项 | 结果 |
|---|---|
| 照片清单 | 11 张全 sample：landscape2 sky2 street2 machine2 abstract3；均无 camera/location 元数据 |
| 分类映射 | 风光=landscape+sky(4)；待确认=street2+machine2+abstract3(7)；人像=0（空态） |
| 点赞 | `usePhotoLikes` 无任何挂载点 → 无 UI 可删；Supabase 表不动 |
| 路由 | 10 路由映射表入 scene-architecture 附录 A |
| 彩蛋冲突 | 单字母快捷键占用 a p e r l o j c；N/W 空闲；Shift+V 与口令属静默空间；新 N→W 钩子需同样 TEXT_ENTRY 守卫 |
| 内容真实性 | projects：1 real shipped（本仓库，无公开 repo URL）+1 sample；lab 3 real+1 sample；contact 5 渠道全未确认 |

## P0-E 结构探针（临时页 `public/__p0e-probe.html`，用后已删除）

| 检查 | 结果 |
|---|---|
| 轨同步（不等高 5 场景） | ✅ 中线 IO 5/5 正确；点击节点跳转并同步 |
| 单时钟展开（容器+球体） | ✅ 中途 p=0.346 时 win/sphere 同帧一致；结束 p=1 win=4 sphere=0.42 done |
| reduced-motion | ✅ 120ms 内 done（D=0 即时） |
| 390px | ✅ 轨隐藏、右缘进度条显示、scrollW==innerW==390 |
| 清理 | ✅ public 下无 `__*` 残留；git status 仅文档 |

## 未解决问题（转入后续阶段）

1. 在线认证未配置（🔒 用户授权门，方案 B 推荐）。
2. schema/数据不一致与 travels 集合缺失（P1）。
3. 首页宣言渲染缺失（P2）。
4. 离线瓦片失败回退（P4）。
5. workflow pnpm 10 与 workspace allowBuilds(pnpm11) 不匹配 → CI 可能 esbuild postinstall 失败（🟡 未实跑 CI；P8 前修）。
6. 7 张照片分类待用户确认；人像素材待提供。
7. dev 下 /admin/ 需 index.html（文档更正在 P1）。
