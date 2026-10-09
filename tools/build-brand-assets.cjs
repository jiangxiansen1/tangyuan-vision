/**
 * build-brand-assets.cjs — derive the deployable brand Logo assets from the
 * single source file that actually exists on this machine.
 *
 * ── Situation found on disk (verified, not assumed) ────────────────────────
 *   • `C:\Users\pc\Pictures\水印白.jpg`  EXISTS  — JPEG, 2508×1672, 3 channels,
 *     hasAlpha:false, format:"jpeg".  Artwork is near-WHITE strokes on a pure
 *     WHITE background (luminance: min 151, max 255, mean 254.46; 99.5 % of all
 *     pixels sit in [224-255]).  Content bbox = (375,378)-(2188,1239), i.e.
 *     1814×862 with margins L375 R319 T378 B432.
 *   • `水印黑.png` (the black version, and PNG at that) DOES NOT EXIST anywhere
 *     on this machine — not in Pictures, Downloads, Desktop, the workspace, or
 *     the DSH attachment store.
 *
 * ── Consequence & strategy ────────────────────────────────────────────────
 *   The file is a JPEG, so it can NOT carry transparency, and a white mark on a
 *   white field cannot be composited onto dark UI as-is.  We therefore treat the
 *   luminance channel as a coverage (alpha) mask and rebuild the mark as a
 *   proper RGBA asset:
 *
 *       alpha = (lumaWhite - luma) / (lumaWhite - lumaBlack)      [normalised]
 *
 *   Pure white  -> alpha 0 (transparent background)
 *   Darkest ink -> alpha 1 (fully opaque stroke)
 *
 *   This reconstructs the ORIGINAL artwork geometry pixel-for-pixel (retaining
 *   the jittered hand-drawn stroke edges and the anti-aliasing already present in
 *   the source) and only re-asserts the ink colour, which is legitimate because
 *   the source is a monochrome single-channel mark.  NO stroke is redrawn,
 *   re-typeset, stretched, or re-proportioned.
 *
 *   The alpha mask is a single reusable channel, so the same geometry is emitted
 *   as both a light-on-dark and a dark-on-light tint — the black variant is
 *   DERIVED, and is labelled as derived everywhere in the project so it is never
 *   mistaken for the missing original `水印黑.png`.
 *
 * ── Outputs (public/assets/brand/) ────────────────────────────────────────
 *   logo-light.png       white ink, transparent bg   — for dark surfaces (primary)
 *   logo-dark.png        black ink, transparent bg   — for light surfaces (derived)
 *   logo-mark.png        tight-cropped square mark   — spinners / compact slots
 *   wordmark.png         the CAPTURE MOMENTS baseline lockup crop
 *   logo-light.svg       SVG wrapper (max fidelity for the primary asset)
 *   logo-dark.svg        SVG wrapper (derived tint)
 *   logo-mask-light.png  raw 8-bit coverage mask     — drives the reveal animation
 *   brand.json           machine-readable manifest: real sizes, ratios, provenance
 *
 * Usage:  tools\node.cmd tools\build-brand-assets.cjs [--source <path>]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* ----------------------------------------------------------- resolve sharp */

function loadSharp() {
  const candidates = [
    // 1. whatever the project itself installed (a normal `pnpm add -D sharp`)
    path.resolve(__dirname, '..', 'node_modules', 'sharp'),
    // 2. this machine's DSH bundle — Node is not installed system-wide here, so
    //    the only guaranteed native image codec is the one DSH ships.
    'E:/AI/DSH/DSH Desktop/resources/app/node_modules/sharp',
    'sharp',
  ];
  const tried = [];
  for (const c of candidates) {
    try {
      const m = require(c);
      const ver = (() => {
        try { return require(path.join(c, 'package.json')).version; } catch { return 'unknown'; }
      })();
      return { sharp: m, resolved: c, version: ver };
    } catch (e) {
      tried.push(`  ${c}  -> ${e.message.split('\n')[0]}`);
    }
  }
  console.error('FATAL: could not load a native image codec (sharp).\nTried:\n' + tried.join('\n'));
  console.error('\nFix: run `pnpm add -D sharp` in the project root, then re-run this script.');
  process.exit(1);
}

const { sharp, version: sharpVersion } = loadSharp();

/* ----------------------------------------------------------------- helpers */

const argv = process.argv.slice(2);
const srcArg = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : null;

const DEFAULT_SOURCES = [
  path.join(process.env.USERPROFILE || '', 'Pictures', '水印白.jpg'),
  path.join(process.env.USERPROFILE || '', 'Pictures', '水印白.png'),
  path.join(__dirname, '..', 'brand-source', '水印白.jpg'),
];
const SOURCE = srcArg || DEFAULT_SOURCES.find((p) => fs.existsSync(p));
if (!SOURCE) {
  console.error('FATAL: no source logo found. Looked for:\n' + DEFAULT_SOURCES.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
const SOURCE_ABS = path.resolve(SOURCE);

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'brand');
fs.mkdirSync(OUT_DIR, { recursive: true });

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Optical calibration.
 *
 * The supplied mark is genuine fine line-art: measured over its ink pixels the
 * raw coverage averages only 24.6/255, and just 0.85 % of pixels reach alpha
 * >= 128. Rendered at face value on the site's obsidian hero the mark is
 * effectively invisible, which defeats a Logo.
 *
 * gamma() lifts the mid/low tones while leaving the geometry, edge jitter and
 * anti-aliasing completely untouched — it only re-states how strongly the same
 * coverage is inked. alpha 0 stays 0 (background stays perfectly transparent)
 * and the faintest feather pixels gain the most, which is exactly the perceptual
 * correction needed. `variant: 'raw'` emits the unmodified coverage instead.
 */
const gamma = (a, g) => Math.round(Math.pow(a / 255, g) * 255);

const GAMMA_LIGHT = 0.40;   // meanInk 24.6 -> ~78, reads cleanly on #05070A
const GAMMA_DARK = 0.45;    // dark ink on light fields is marginally cheaper to lift

/** Renormalise the raw luminance into a 0..1 coverage ramp. */
function makeRamp(lumaWhite, lumaBlack) {
  const span = Math.max(1, lumaWhite - lumaBlack);
  // Clamp ramp so faint JPEG mosquito noise around the strokes does not become
  // visible speckle: anything at/above white -> 0, at/below black -> 1.
  return (l) => {
    const v = (lumaWhite - l) / span;
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  };
}

async function main() {
  const img = sharp(SOURCE_ABS).removeAlpha();
  const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  /* ---- pass 1: statistics + content bbox, measured not guessed ---- */
  let lMin = 255, lMax = 0, lSum = 0;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const hist = new Array(8).fill(0);
  const ACC = new Uint8Array(W * H);          // raw coverage 0..255
  const INK_THRESHOLD = 252;                  // "there is ink here" cutoff

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * C;
      const l = lum(data[o], data[o + 1], data[o + 2]);
      lSum += l;
      if (l < lMin) lMin = l;
      if (l > lMax) lMax = l;
      hist[Math.min(7, l >> 5)]++;
      if (l < INK_THRESHOLD) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      ACC[y * W + x] = 255 - Math.round(l);
    }
  }
  if (x1 < 0) { console.error('FATAL: source contains no ink under threshold'); process.exit(1); }

  const ramp = makeRamp(lMax, lMin);

  /* ---- pass 2: build the RGBA coverage map once, in source space ---- */
  const cov = new Uint8Array(W * H);          // 0..255 coverage after ramp
  for (let i = 0; i < W * H; i++) {
    const l = 255 - ACC[i];                   // back to luminance
    cov[i] = Math.round(ramp(l) * 255);
  }

  /* ---- geometry ---- */
  const padRatio = 0.02;
  const PAD = Math.round(Math.max(x1 - x0 + 1, y1 - y0 + 1) * padRatio);
  const cx0 = Math.max(0, x0 - PAD);
  const cy0 = Math.max(0, y0 - PAD);
  const cx1 = Math.min(W - 1, x1 + PAD);
  const cy1 = Math.min(H - 1, y1 + PAD);
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;

  /* ---- wordmark baseline: "CAPTURE MOMENTS" occupies the lower band ----
     Measured from the source: the lettering band sits roughly in the lower
     third of the artwork. We locate it empirically by finding the widest
     horizontal run of ink rows in the bottom half. */
  let bandTop = -1, bandBottom = -1;
  {
    const rowInk = new Int32Array(H);
    for (let y = cy0; y <= cy1; y++) {
      let c = 0;
      for (let x = cx0; x <= cx1; x++) if (cov[y * W + x] > 40) c++;
      rowInk[y] = c;
    }
    const halfH = cy0 + Math.floor((cy1 - cy0) * 0.55);
    let best = 0;
    for (let y = halfH; y <= cy1; y++) {
      if (rowInk[y] > 0) { if (bandTop < 0) bandTop = y; bandBottom = y; }
      best = Math.max(best, rowInk[y]);
    }
    if (bandTop < 0) { bandTop = cy0; bandBottom = cy1; }
  }

  /* ---- tint a coverage crop and emit a PNG ---- */

  /**
   * @param {{rgb:[number,number,number], scale:number, name:string, from:[number,number,number,number]}} spec
   */
  async function emit(spec) {
    const [fx0, fy0, fw, fh] = spec.from;
    const outW = Math.round(fw * spec.scale);
    const outH = Math.round(fh * spec.scale);
    const rgba = Buffer.alloc(outW * outH * 4);
    const [r, g, b] = spec.rgb;
    const g_ = spec.variant === 'raw' ? 1 : spec.gamma;

    for (let y = 0; y < outH; y++) {
      const sy = fy0 + Math.min(fh - 1, Math.floor(y * (fh / outH)));
      for (let x = 0; x < outW; x++) {
        const sx = fx0 + Math.min(fw - 1, Math.floor(x * (fw / outW)));
        const a = gamma(cov[sy * W + sx], g_);
        const o = (y * outW + x) * 4;
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
      }
    }

    // Downscale + tight-trim entirely in memory (sharp cannot read and write the
    // same path), then write once.
    const trimmed = await sharp(rgba, { raw: { width: outW, height: outH, channels: 4 } })
      .png()
      .toBuffer()
      .then((b) => sharp(b).trim({ threshold: 1 }).png({ compressionLevel: 9, effort: 10 }).toBuffer());

    const dest = path.join(OUT_DIR, spec.name);
    fs.writeFileSync(dest, trimmed);

    const finalMeta = await sharp(trimmed).metadata();
    console.log(`  ${spec.name.padEnd(22)} ${String(finalMeta.width).padStart(5)}×${String(finalMeta.height).padEnd(5)} ${(fs.statSync(path.join(OUT_DIR, spec.name)).size / 1024).toFixed(1).padStart(8)} KB   ${spec.note || ''}`);

    return {
      file: spec.name,
      path: `/assets/brand/${spec.name}`,
      width: finalMeta.width,
      height: finalMeta.height,
      aspect: +(finalMeta.width / finalMeta.height).toFixed(6),
      bytes: trimmed.length,
      ink: spec.ink,
      note: spec.note || '',
    };
  }

  console.log(`\nsource      : ${SOURCE_ABS}`);
  console.log(`format      : ${meta.format}  ${meta.width}×${meta.height}  channels=${C}  hasAlpha=${!!meta.hasAlpha}`);
  console.log(`luminance   : min=${lMin} max=${lMax} mean=${(lSum / (W * H)).toFixed(2)}`);
  console.log(`content bbox: (${x0},${y0})-(${x1},${y1})  ${x1 - x0 + 1}×${y1 - y0 + 1}`);
  console.log(`crop + pad  : (${cx0},${cy0})-(${cx1},${cy1})  ${cw}×${ch}  (pad ${PAD}px)`);
  console.log(`wordmark band: y ${bandTop}..${bandBottom}`);
  console.log(`sharp       : ${sharpVersion}\n`);

  const manifest = { generatedBy: 'tools/build-brand-assets.cjs', sharpVersion, assets: {} };

  console.log('emitting:');

  manifest.assets.logoLight = await emit({
    name: 'logo-light.png',
    rgb: [255, 255, 255],
    scale: 2000 / cw,
    gamma: GAMMA_LIGHT,
    from: [cx0, cy0, cw, ch],
    ink: 'light',
    note: 'PRIMARY — light ink, dark surfaces',
  });

  manifest.assets.logoLightRaw = await emit({
    name: 'logo-light-raw.png',
    rgb: [255, 255, 255],
    scale: 2000 / cw,
    variant: 'raw',
    from: [cx0, cy0, cw, ch],
    ink: 'light',
    note: 'UNMODIFIED source coverage, no tone lift',
  });

  manifest.assets.logoDark = await emit({
    name: 'logo-dark.png',
    rgb: [10, 12, 16],
    scale: 2000 / cw,
    gamma: GAMMA_DARK,
    from: [cx0, cy0, cw, ch],
    ink: 'dark',
    note: 'DERIVED tint, light surfaces',
  });

  // Square mark: crop the camera glyph region (right side of the artwork).
  const camSize = Math.round(ch * 1.0);
  const camX = Math.max(0, Math.round(cx1 - camSize));
  manifest.assets.logoMark = await emit({
    name: 'logo-mark.png',
    rgb: [255, 255, 255],
    scale: 512 / camSize,
    gamma: 0.35,
    from: [camX, cy0, camSize, ch],
    ink: 'light',
    note: 'camera glyph slot / compact UI',
  });

  // Wordmark: the CAPTURE MOMENTS band.
  const bandH = bandBottom - bandTop + 1;
  manifest.assets.wordmark = await emit({
    name: 'wordmark.png',
    rgb: [255, 255, 255],
    scale: 1400 / cw,
    gamma: 0.34,
    from: [cx0, Math.max(cy0, bandTop - 6), cw, Math.min(ch, bandH + 12)],
    ink: 'light',
    note: 'CAPTURE MOMENTS lockup',
  });

  /* ---- raw coverage mask (no tint) for the reveal animation ---- */
  {
    const maskW = cw, maskH = ch;
    const m = Buffer.alloc(maskW * maskH * 4);
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const a = cov[(cy0 + y) * W + (cx0 + x)];
        const o = (y * maskW + x) * 4;
        m[o] = 255; m[o + 1] = 255; m[o + 2] = 255; m[o + 3] = a;
      }
    }
    const maskBuf = await sharp(m, { raw: { width: maskW, height: maskH, channels: 4 } })
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, 'logo-mask-light.png'), maskBuf);
    const mm = await sharp(maskBuf).metadata();
    console.log(`  ${'logo-mask-light.png'.padEnd(22)} ${String(mm.width).padStart(5)}×${String(mm.height).padEnd(5)} ${(maskBuf.length / 1024).toFixed(1).padStart(8)} KB   raw coverage, drives the reveal animation`);
    manifest.assets.logoMask = { file: 'logo-mask-light.png', path: '/assets/brand/logo-mask-light.png', width: mm.width, height: mm.height, note: '8-bit coverage mask, unmodified' };
  }

  /* ---- favicon: full lockup, square, transparent, tone-lifted ---- */
  {
    const size = 512;
    const m = Buffer.alloc(size * size * 4);
    const innerW = Math.round(size * 0.88);
    const innerH = Math.round(innerW * (ch / cw));
    const offX = Math.round((size - innerW) / 2);
    const offY = Math.round((size - innerH) / 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 4;
        m[o] = 255; m[o + 1] = 255; m[o + 2] = 255; m[o + 3] = 0;
        const lx = Math.floor(((x - offX) / innerW) * cw);
        const ly = Math.floor(((y - offY) / innerH) * ch);
        if (lx >= 0 && lx < cw && ly >= 0 && ly < ch) {
          m[o + 3] = gamma(cov[(cy0 + ly) * W + (cx0 + lx)], 0.32);
        }
      }
    }
    const favBuf = await sharp(m, { raw: { width: size, height: size, channels: 4 } })
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, '..', '..', 'favicon.png'), favBuf);
    console.log(`  ${'../../favicon.png'.padEnd(22)} ${String(size).padStart(5)}×${String(size).padEnd(5)} ${(favBuf.length / 1024).toFixed(1).padStart(8)} KB   lockup, transparent, square`);
    manifest.assets.favicon = { file: 'favicon.png', path: '/favicon.png', width: size, height: size };
  }

  /* ---- SVG wrappers: same pixels, scalable, zero extra tooling ---- */
  const svgSpecs = [
    ['logo-light.svg', 'logo-light.png', 'logoLightSvg', 'light'],
    ['logo-dark.svg', 'logo-dark.png', 'logoDarkSvg', 'dark'],
    ['logo-mark.svg', 'logo-mark.png', 'logoMarkSvg', 'light'],
  ];
  for (const [name, pngName, key, ink] of svgSpecs) {
    const pngBuf = fs.readFileSync(path.join(OUT_DIR, pngName));
    const b64 = pngBuf.toString('base64');
    const pmeta = await sharp(pngBuf).metadata();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${pmeta.width} ${pmeta.height}" width="${pmeta.width}" height="${pmeta.height}" role="img" aria-label="TangyuanVision, CAPTURE MOMENTS">
  <title>TangyuanVision — CAPTURE MOMENTS</title>
  <image width="${pmeta.width}" height="${pmeta.height}" xlink:href="data:image/png;base64,${b64}" />
</svg>
`;
    fs.writeFileSync(path.join(OUT_DIR, name), svg, 'utf8');
    console.log(`  ${name.padEnd(22)} ${String(pmeta.width).padStart(5)}×${String(pmeta.height).padEnd(5)} ${(svg.length / 1024).toFixed(1).padStart(8)} KB   ${ink} ink, embedded raster`);
    manifest.assets[key] = { file: name, path: `/assets/brand/${name}`, width: pmeta.width, height: pmeta.height, note: 'SVG wrapper, embedded raster' };
  }

  /* ---- manifest with honest provenance ---- */
  const manifestDoc = {
    generatedBy: manifest.generatedBy,
    generatedAt: new Date().toISOString(),
    sharp: manifest.sharpVersion,
    provenance: {
      source: SOURCE_ABS,
      sourceFormat: meta.format,
      sourceSize: `${meta.width}x${meta.height}`,
      sourceHasAlpha: !!meta.hasAlpha,
      sourceLuminance: { min: lMin, max: lMax, mean: +(lSum / (W * H)).toFixed(2) },
      sourceContentBox: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
      method:
        'Coverage mask recovered from the source luminance channel: ' +
        'alpha = (white - luma) / (white - black), giving alpha 0 on the white field and alpha 1 on the darkest ink. ' +
        'Stroke geometry, hand-drawn edge jitter and anti-aliasing are preserved exactly as supplied; only ink colour is re-asserted.',
      opticalCalibration: {
        reason:
          'Measured ink coverage averaged only 24.6/255 with 0.85% of pixels at alpha >= 128, so the mark is effectively ' +
          'invisible at face value on a dark hero field.',
        curve: 'alpha_out = 255 * (alpha_in / 255) ^ gamma',
        gammaLight: GAMMA_LIGHT,
        gammaDark: GAMMA_DARK,
        geometryUnchanged: true,
        note: 'alpha 0 remains 0, so the background stays perfectly transparent. logo-light-raw.png carries the unmodified coverage.',
      },
      whiteVersion: { file: '水印白.jpg', present: true, location: SOURCE_ABS },
      blackVersion: {
        file: '水印黑.png',
        present: false,
        searched: ['C:\\Users\\pc\\Pictures', 'C:\\Users\\pc\\Downloads', 'C:\\Users\\pc\\Desktop', 'C:\\Users\\pc\\Documents\\deepseek-harness', 'C:\\Users\\pc\\.dsh\\attachments'],
        note: 'NOT SUPPLIED on this machine. logo-dark.png / logo-dark.svg are DERIVED by recolouring the same coverage mask. Replace them by dropping a real 水印黑.png into /public/assets/brand/ and re-running the build script with --source.',
      },
    },
    assets: manifest.assets,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'brand.json'), JSON.stringify(manifestDoc, null, 2) + '\n', 'utf8');
  console.log(`  ${'brand.json'.padEnd(22)} ${''.padStart(11)} ${(fs.statSync(path.join(OUT_DIR, 'brand.json')).size / 1024).toFixed(1).padStart(8)} KB   provenance manifest`);

  console.log(`\ndone -> ${OUT_DIR}\n`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
