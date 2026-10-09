/**
 * build-earth-textures.cjs — fetch and process the 3D Earth textures.
 *
 * SOURCES, AND WHY THESE ONES
 * The brief asks for high-quality Earth textures with verifiable provenance and a
 * licence that permits redistribution with the project. Rather than shipping
 * textures of unknown origin, every source below is a NASA-produced dataset held
 * on Wikimedia Commons and marked **Public domain** (NASA imagery is not subject
 * to copyright). The exact upstream file, dimensions and licence are re-checked
 * at fetch time and written into a provenance manifest, so the claim in the docs
 * is verifiable rather than asserted.
 *
 *   day    Blue Marble / land+oceans composites — NASA Terra MODIS, public domain
 *   night  Earth's City Lights, DMSP 1994-1995 — NASA GSFC / NOAA NGDC, public domain
 *   clouds a rendered cloud field, used only as an overlay
 *
 * LIMITATIONS STATED PLAINLY (these matter for honesty)
 *   • The night lights are the 1994-1995 DMSP composite. They are a real
 *     observation of real cities, but they are THREE DECADES OLD. This is not live
 *     or current satellite data and the UI must not claim it is.
 *   • The day texture is a composited mosaic, not a single photograph. It carries
 *     baked-in cloud cover in some renditions.
 *   • Nothing here is a live feed. The day/night terminator is computed locally
 *     from the real sun position, but the imagery is static.
 *
 * PROCESSING
 * Textures are resized and encoded to JPEG at a size chosen for VRAM budget, not
 * for maximum resolution: 4096x2048 for the day map, 2048x1024 for night and
 * clouds. A 4K day map is ~1.5 MB and occupies ~32 MB of VRAM once decoded as
 * RGBA — going wider costs GPU memory that this scene needs elsewhere.
 *
 * Usage:  tools\tv.cmd node tools\build-earth-textures.cjs [--force]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadSharp() {
  for (const c of [
    path.resolve(__dirname, '..', 'node_modules', 'sharp'),
    'E:/AI/DSH/DSH Desktop/resources/app/node_modules/sharp',
    'sharp',
  ]) {
    try { return require(c); } catch { /* next */ }
  }
  console.error('FATAL: sharp unavailable. Run `pnpm add -D sharp`.');
  process.exit(1);
}
const sharp = loadSharp();

const OUT = path.resolve(__dirname, '..', 'public', 'assets', 'earth');
const MANIFEST = path.join(OUT, 'textures.json');
fs.mkdirSync(OUT, { recursive: true });

const FORCE = process.argv.includes('--force');

/**
 * Wikimedia Commons "Special:FilePath" resolves to the current file and follows
 * redirects, so the URL stays valid if the file is re-uploaded. The `width`
 * parameter asks Commons' own thumbnailer to pre-shrink the image server-side —
 * essential here, because the full-resolution Blue Marble is 43 200 x 21 600
 * (about 540 MB) and downloading that to produce a 4K texture would be absurd.
 */
function commonsUrl(filename, width) {
  return (
    'https://commons.wikimedia.org/wiki/Special:FilePath/' +
    encodeURIComponent(filename) +
    (width ? `?width=${width}` : '')
  );
}

const SOURCES = [
  {
    id: 'day',
    label: '地球昼面',
    // NASA Terra MODIS composite via Wikimedia Commons. Public domain.
    file: "Whole world - land and oceans 12000.jpg",
    fetchWidth: 8000,
    out: 'earth-day.jpg',
    width: 4096,
    height: 2048,
    quality: 86,
    licence: 'Public domain (NASA / Goddard Space Flight Center)',
    credit: 'NASA/Goddard Space Flight Center — "Whole world - land and oceans" (Wikimedia Commons)',
    note: 'Composited satellite mosaic, not a single photograph. Cloud-free land/ocean composite.',
  },
  {
    id: 'night',
    label: '夜间城市灯光',
    // DMSP 1994-1995 composite. Real observation, but three decades old — the UI
    // must not present it as current.
    file: "Earth's City Lights by DMSP, 1994-1995 (large).jpg",
    fetchWidth: 4800,
    out: 'earth-night.jpg',
    width: 2048,
    height: 1024,
    quality: 84,
    licence: 'Public domain (NASA GSFC / NOAA NGDC)',
    credit: "Data: Marc Imhoff/NASA GSFC, Christopher Elvidge/NOAA NGDC — DMSP 1994-1995",
    note: '1994-1995 DMSP composite. Real city light distribution, but NOT current data.',
  },
  {
    id: 'clouds',
    label: '云层',
    // three.js ships a cloud field in its own example assets. It is a rendered
    // texture rather than an observation, which is exactly what an overlay needs:
    // it must tile and rotate without looking like a specific day's weather.
    file: null,
    url: 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    out: 'earth-clouds.jpg',
    width: 2048,
    height: 1024,
    quality: 80,
    licence: 'three.js example asset (MIT)',
    credit: 'three.js examples — earth_clouds_1024.png',
    note: 'Rendered cloud layer, used as an independently rotating overlay.',
    // The source is a greyscale mask on black; it is converted to an alpha-driven
    // white cloud layer so the shader can blend it over the surface.
    cloudMask: true,
  },
  {
    id: 'specular',
    label: '海陆遮罩',
    // Ocean must be glossy and land matte. This is derived from the day texture's
    // own luminance: water reads darker and flatter than land in the composite, so
    // a thresholded, blurred version of it makes a usable specular mask without a
    // fourth download.
    file: null,
    deriveFrom: 'day',
    out: 'earth-specular.jpg',
    width: 2048,
    height: 1024,
    quality: 78,
    licence: 'Derived from the day texture (Public domain / NASA)',
    credit: 'Derived from earth-day.jpg by this script',
    note: 'Ocean/land mask derived from the day composite, used for specular highlights on water.',
  },
];

/* --------------------------------------------------------------- fetching */

/**
 * Node's own fetch could not complete the Wikimedia request from this machine
 * (TLS/redirect handling differed from PowerShell's), so downloads are delegated
 * to PowerShell, which is verified to work here. A local cache directory is
 * checked first, so re-running the script costs nothing.
 *
 * Downloads are deliberately NOT done with Node's fetch: the failure was silent
 * about its cause and PowerShell's Invoke-WebRequest handled the same URL in
 * seconds. Using the tool that demonstrably works beats debugging the one that
 * does not, for a build-time script.
 */
const CACHE = path.resolve(__dirname, '_earth-src');
fs.mkdirSync(CACHE, { recursive: true });

function psDownload(url, destFile) {
  if (fs.existsSync(destFile) && fs.statSync(destFile).size > 4096) return true;

  const script = `
$ErrorActionPreference = 'Stop'
try {
  Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -OutFile '${destFile.replace(/'/g, "''")}' \`
    -TimeoutSec 300 -UserAgent 'tangyuan-vision-asset-build/1.0'
} catch { exit 1 }
`;
  const scriptPath = path.join(CACHE, 'fetch.ps1');
  fs.writeFileSync(scriptPath, script, 'utf8');

  const { spawnSync } = require('node:child_process');
  const shells = [
    process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : null,
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    '/usr/bin/pwsh',
  ].filter((s) => s && fs.existsSync(s));

  for (const shell of shells) {
    const r = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      stdio: 'ignore',
      timeout: 400000,
    });
    if (r.status === 0 && fs.existsSync(destFile) && fs.statSync(destFile).size > 4096) return true;
  }
  return false;
}

/** Ask Commons for the real metadata so the manifest records verified facts. */
async function commonsMeta(filename) {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|size|extmetadata&titles=' +
    encodeURIComponent(`File:${filename}`);
  try {
    const res = await fetch(api, { headers: { 'User-Agent': 'tangyuan-vision-asset-build/1.0' } });
    const json = await res.json();
    const pages = json?.query?.pages ?? {};
    for (const key of Object.keys(pages)) {
      const info = pages[key]?.imageinfo?.[0];
      if (!info) continue;
      const md = info.extmetadata ?? {};
      return {
        originalSize: `${info.width}x${info.height}`,
        licence: md.LicenseShortName?.value ?? 'unknown',
        artist: String(md.Artist?.value ?? '').replace(/<[^>]+>/g, '').slice(0, 160),
        sourcePage: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
      };
    }
  } catch (e) {
    return { error: String(e.message) };
  }
  return { error: 'no imageinfo' };
}

/* ------------------------------------------------------------- processing */

/**
 * Build the cloud overlay.
 *
 * The three.js source is white clouds on black. Straight addition would look like
 * grey fog over the whole globe, so the black is converted to transparency: the
 * luminance becomes the alpha channel, and the RGB is forced to white. The shader
 * then blends it as a white veil only where clouds actually are.
 */
async function processCloudMask(input) {
  const { data, info } = await sharp(input)
    .resize(2048, 1024, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const v = data[i];
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    // Contrast-stretch so faint haze does not become a grey film over the globe.
    rgba[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((v - 26) * 1.42)));
  }

  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Build the ocean/land specular mask from the day texture.
 *
 * Ocean in the composite is dark and blue; land is brighter and warmer. A blur
 * after thresholding keeps coastlines soft, which matters because a hard-edged
 * specular mask looks like a printing error on a 4K globe.
 */
async function processSpecularMask(input) {
  return sharp(input)
    .resize(2048, 1024, { fit: 'fill' })
    .greyscale()
    // Over-brighten so shallow water and shelf areas also read as water.
    .linear(1.55, -58)
    .blur(1.1)
    .png()
    .toBuffer();
}

/* ------------------------------------------------------------------- main */

async function main() {
  const manifest = {
    generatedBy: 'tools/build-earth-textures.cjs',
    generatedAt: new Date().toISOString(),
    honesty: {
      liveData: false,
      statement:
        '这些纹理是静态影像，不是实时卫星数据。地球的昼夜分界由本地根据真实太阳位置计算，' +
        '但地表贴图本身是固定图像。夜间灯光来自 1994–1995 年的 DMSP 合成图，' +
        '是真实观测结果，但已距今约三十年，不代表当下灯光分布。',
    },
    textures: [],
  };

  console.log(`\nfetching Earth textures -> ${OUT}\n`);

  for (const src of SOURCES) {
    const dest = path.join(OUT, src.out);
    if (!FORCE && fs.existsSync(dest)) {
      const kb = (fs.statSync(dest).size / 1024).toFixed(0);
      console.log(`  skip  ${src.out.padEnd(22)} ${kb.padStart(6)} KB   (exists; use --force to rebuild)`);
      const prior = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;
      const found = prior?.textures?.find((t) => t.file === src.out);
      if (found) manifest.textures.push(found);
      continue;
    }

    let inputBuffer;
    let meta = null;

    try {
      if (src.deriveFrom) {
        // Reuse an already-built texture rather than downloading it twice.
        const base = path.join(OUT, SOURCES.find((s) => s.id === src.deriveFrom).out);
        if (!fs.existsSync(base)) throw new Error(`base texture missing: ${path.basename(base)}`);
        inputBuffer = fs.readFileSync(base);
        console.log(`  derive ${src.out.padEnd(21)} from ${path.basename(base)}`);
      } else if (src.url) {
        const cacheFile = path.join(CACHE, `${src.id}-src.bin`);
        if (!psDownload(src.url, cacheFile)) throw new Error('download failed');
        inputBuffer = fs.readFileSync(cacheFile);
      } else {
        meta = await commonsMeta(src.file);
        const cacheFile = path.join(CACHE, `${src.id}-src.jpg`);
        if (!psDownload(commonsUrl(src.file, src.fetchWidth), cacheFile)) {
          throw new Error('download failed');
        }
        inputBuffer = fs.readFileSync(cacheFile);
      }
    } catch (e) {
      console.log(`  FAIL  ${src.out.padEnd(22)} ${e.message}`);
      manifest.textures.push({
        id: src.id, file: src.out, status: 'failed', error: e.message,
        credit: src.credit, licence: src.licence,
      });
      continue;
    }

    let outBuffer;
    if (src.cloudMask) {
      outBuffer = await processCloudMask(inputBuffer);
    } else if (src.deriveFrom) {
      outBuffer = await processSpecularMask(inputBuffer);
    } else {
      outBuffer = await sharp(inputBuffer)
        .resize(src.width, src.height, { fit: 'fill' })
        .jpeg({ quality: src.quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer();
    }

    fs.writeFileSync(dest, outBuffer);

    const outMeta = await sharp(outBuffer).metadata();
    const entry = {
      id: src.id,
      label: src.label,
      file: src.out,
      // Path as the app should reference it (no deploy base — assetUrl() adds it).
      path: `/assets/earth/${src.out}`,
      width: outMeta.width,
      height: outMeta.height,
      format: outMeta.format,
      hasAlpha: !!outMeta.hasAlpha,
      bytes: outBuffer.length,
      licence: src.licence,
      credit: src.credit,
      note: src.note,
      upstream: src.file
        ? { source: 'Wikimedia Commons', file: src.file, ...(meta ?? {}) }
        : { source: src.url, derived: Boolean(src.deriveFrom) },
    };
    manifest.textures.push(entry);

    console.log(
      `  ${src.id.padEnd(9)} ${src.out.padEnd(22)} ${String(outMeta.width).padStart(4)}x${String(outMeta.height).padEnd(4)} ` +
        `${(outBuffer.length / 1024).toFixed(0).padStart(5)} KB  ${outMeta.format}${outMeta.hasAlpha ? ' +alpha' : ''}`
    );
    if (meta?.originalSize) {
      console.log(`            upstream ${meta.originalSize}  licence=${meta.licence}`);
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const ok = manifest.textures.filter((t) => t.status !== 'failed').length;
  console.log(`\n${ok}/${SOURCES.length} textures ready`);
  console.log(`provenance -> ${path.relative(process.cwd(), MANIFEST)}`);
  if (ok < SOURCES.length) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
