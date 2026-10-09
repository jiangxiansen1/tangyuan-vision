/**
 * manifest.ts — brand asset geometry.
 *
 * `public/` is copied verbatim by Vite and is not meant to be imported from, so
 * the geometry is recorded here rather than read from the generated brand.json.
 * These are the MEASURED outputs of tools/build-brand-assets.cjs applied to the
 * supplied 水印白.jpg (source 2508×1672, artwork bounding box 1814×862):
 *
 *   logo-light.png / logo-dark.png   1926 × 913   aspect 2.1095
 *   logo-mark.png                     493 × 473   aspect 1.0423
 *   wordmark.png                     1165 × 291   aspect 4.0034
 *   logo-mask-light.png              1886 × 934   aspect 2.0193
 *
 * Recording the real numbers here is what lets the Logo reserve the correct
 * space before the bytes arrive, so the header never jumps.
 *
 * The same figures are written to public/assets/brand/brand.json at build time;
 * that file is the machine-readable copy for tooling, this module is the one the
 * bundle uses.
 */

export interface BrandAsset {
  file: string;
  /** Path WITHOUT the deploy base — always resolve through assetUrl(). */
  path: string;
  width: number;
  height: number;
  aspect: number;
  /** Which ink colour the asset carries. */
  ink: 'light' | 'dark';
  label: string;
}

function asset(
  file: string,
  width: number,
  height: number,
  ink: 'light' | 'dark',
  label: string
): BrandAsset {
  return {
    file,
    path: `/assets/brand/${file}`,
    width,
    height,
    aspect: width / height,
    ink,
    label,
  };
}

export const BRAND_ASSETS = {
  /** Primary lockup, white ink, transparent background — for dark surfaces. */
  light: asset('logo-light.png', 1926, 913, 'light', '主标识 · 浅色墨'),
  /** DERIVED tint of the same coverage mask — for light surfaces. */
  dark: asset('logo-dark.png', 1926, 913, 'dark', '主标识 · 深色墨（派生）'),
  /** Unmodified source coverage, no tone lift. Kept for fidelity comparison. */
  lightRaw: asset('logo-light-raw.png', 1926, 913, 'light', '主标识 · 原始覆盖率'),
  /** Tight camera-glyph crop for compact slots. */
  mark: asset('logo-mark.png', 493, 473, 'light', '相机图形'),
  /** The CAPTURE MOMENTS lockup on its own. */
  wordmark: asset('wordmark.png', 1165, 291, 'light', '文字锁定'),
  /** Raw 8-bit coverage mask — drives the boot reveal. */
  mask: asset('logo-mask-light.png', 1886, 934, 'light', '覆盖率蒙版'),
} as const;

/** Provenance record, surfaced in the About page and in the delivery docs. */
export const BRAND_PROVENANCE = {
  sourceFile: '水印白.jpg',
  sourceFormat: 'jpeg',
  sourceSize: '2508 × 1672',
  sourceHasAlpha: false,
  artworkBox: '1814 × 862 at (375, 378)',
  method: 'coverage mask recovered from the source luminance channel',
  opticalGamma: { light: 0.4, dark: 0.45 },
  blackVersionSupplied: false,
  blackVersionNote:
    '水印黑.png 并未提供，磁盘上不存在该文件。logo-dark.png 由同一份覆盖率蒙版重新着色得到，属于派生资源，不能替代原始黑色版本。',
} as const;
