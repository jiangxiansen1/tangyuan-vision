# 第三方资源：MediaPipe Tasks Vision（手势识别）

本目录下的文件是从官方 npm 包与官方模型仓库**原样复制**而来，用于让手势识别在
**不依赖任何运行时 CDN** 的情况下工作（本项目的网络约束要求本地静态资源）。
许可证与来源如下；这些文件不属于本站原创内容，按其原始许可证分发。

| 文件 | 来源 | 版本/URL | 许可证 |
|---|---|---|---|
| `vision_bundle.mjs` | npm `@mediapipe/tasks-vision` | 1.1.0 · https://registry.npmjs.org/@mediapipe/tasks-vision | Apache-2.0 |
| `wasm/vision_wasm_internal.{js,wasm}` | 同上（SIMD 运行时） | 1.1.0 | Apache-2.0 |
| `wasm/vision_wasm_nosimd_internal.{js,wasm}` | 同上（无 SIMD 运行时，供老设备回退） | 1.1.0 | Apache-2.0 |
| `../../models/hand_landmarker.task` | Google MediaPipe 模型仓库 | hand_landmarker / float16 / 1 · https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task | Apache-2.0（随 MediaPipe 分发） |

- Apache-2.0 全文：https://www.apache.org/licenses/LICENSE-2.0
- 上游项目：https://github.com/google-ai-edge/mediapipe
- 体积说明（AGENTS.md 的 >200KB 规则例外，需按规则说明）：合计约 32.2MB，构成为
  SIMD wasm 12.4MB + 无 SIMD wasm 11.6MB + 两者 JS 加载器 0.64MB + API 包 0.15MB + 手部模型 7.46MB。
- 为什么这么大：MediaPipe 的手部识别运行时与模型都是二进制资产，官方未提供更小的等价替代；
  若不本地化则必须在运行时访问第三方 CDN，这与本项目"不依赖 CDN"的要求冲突。
- 替换方式：将来若改用 npm 依赖 + 构建期资源输出，可删除本目录并改为 `import` 包内资源；
  功能代码只通过下面两个路径访问资源，替换时只需保持路径或同步修改 `GestureControl.tsx`：
  `BASE_URL + 'vendor/mediapipe/vision_bundle.mjs'` 与 `BASE_URL + 'models/hand_landmarker.task'`。
