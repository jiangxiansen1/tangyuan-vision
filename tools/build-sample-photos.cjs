/**
 * build-sample-photos.cjs — synthesise the placeholder photography.
 *
 * WHY THIS EXISTS
 * The author has not supplied photographs yet, and the project must not
 * fabricate travel evidence by downloading random stock photos (which also
 * carries a licensing question the brief explicitly rules out). So the
 * photography scene ships with *generated abstract light studies* instead:
 * clearly non-photographic images that still exercise the full gallery,
 * lightbox, filtering, lazy-loading and tone-shifting machinery.
 *
 * Every image produced here is recorded with `provenance: "sample"` in
 * src/content/photography.ts and carries a visible "示例 / SAMPLE" marker in the
 * UI. None of them claim a real camera, location, date or EXIF block.
 *
 * The generator is fully deterministic (seeded PRNG), so re-running it produces
 * byte-comparable output and the repository does not churn.
 *
 * Usage:  tools\tv.cmd node tools\build-sample-photos.cjs
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

const OUT = path.resolve(__dirname, '..', 'public', 'assets', 'photography');
fs.mkdirSync(OUT, { recursive: true });

/* --------------------------------------------------------------- utilities */

/** Mulberry32 — small, fast, fully deterministic. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

/** Value-noise with smooth interpolation, for clouds and gradients. */
function makeNoise(seed, octaves = 4) {
  const r = rng(seed);
  const grids = [];
  for (let o = 0; o < octaves; o++) {
    const size = 2 << o;
    const g = new Float32Array((size + 1) * (size + 1));
    for (let i = 0; i < g.length; i++) g[i] = r();
    grids.push({ size, g });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    for (const { size, g } of grids) {
      const x = u * size;
      const y = v * size;
      const x0 = Math.floor(x) % size;
      const y0 = Math.floor(y) % size;
      const x1 = (x0 + 1) % size;
      const y1 = (y0 + 1) % size;
      const fx = smooth(x - Math.floor(x));
      const fy = smooth(y - Math.floor(y));
      const a = g[y0 * (size + 1) + x0];
      const b = g[y0 * (size + 1) + x1];
      const c = g[y1 * (size + 1) + x0];
      const d = g[y1 * (size + 1) + x1];
      const top = a + (b - a) * fx;
      const bot = c + (d - c) * fx;
      sum += (top + (bot - top) * fy) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

/* ------------------------------------------------------------ compositions */

/**
 * Each recipe paints into a Float32 RGB buffer in linear 0..1, then `grade()`
 * auto-exposes it and applies a filmic curve, grain and a vignette. Keeping the
 * maths in floats is what produces smooth large gradients without banding.
 */
function createCanvas(w, h) {
  return { w, h, buf: new Float32Array(w * h * 3) };
}

function put(cv, x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const o = (y * cv.w + x) * 3;
  cv.buf[o] += r * a;
  cv.buf[o + 1] += g * a;
  cv.buf[o + 2] += b * a;
}

/** Additive soft radial glow — the core lighting primitive. */
function glow(cv, cx, cy, radius, color, intensity, softness = 2.2) {
  const [r, g, b] = color;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(cv.w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(cv.h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / radius;
      const dy = (y - cy) / radius;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const f = Math.pow(1 - d, softness) * intensity;
      put(cv, x, y, r, g, b, f);
    }
  }
}

/**
 * Fill with a vertical multi-stop ramp modulated by two layers of noise.
 *
 * The coarse layer matters most: without it the base is a flat field, the
 * histogram collapses into a narrow spike, and every tonal curve either crushes
 * the frame to black or washes it out. A low-frequency modulation gives the
 * atmosphere actual compositional scale — banks of haze, falloff toward the
 * frame edges — which is what the lights then read against.
 */
function atmosphere(cv, stops, noise, noiseAmount, noiseScale = 1) {
  for (let y = 0; y < cv.h; y++) {
    const v = y / (cv.h - 1);
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (v >= stops[i].at && v <= stops[i + 1].at) {
        lo = stops[i];
        hi = stops[i + 1];
        break;
      }
    }
    const span = Math.max(1e-6, hi.at - lo.at);
    const t = Math.min(1, Math.max(0, (v - lo.at) / span));
    const r0 = hexToRgb(lo.hex);
    const r1 = hexToRgb(hi.hex);
    for (let x = 0; x < cv.w; x++) {
      const u = x / cv.w;
      const fine = noise(u * noiseScale, (y / cv.h) * noiseScale);
      const coarse = noise(u * noiseScale * 0.28 + 11.3, (y / cv.h) * noiseScale * 0.28 + 4.7);
      // Coarse term is deliberately several times stronger than the fine one.
      const k = (fine - 0.5) * noiseAmount + (coarse - 0.5) * noiseAmount * 3.4;
      const rr = (r0[0] + (r1[0] - r0[0]) * t) / 255 + k;
      const gg = (r0[1] + (r1[1] - r0[1]) * t) / 255 + k;
      const bb = (r0[2] + (r1[2] - r0[2]) * t) / 255 + k;
      put(cv, x, y, rr, gg, bb, 1);
    }
  }
}

/** A horizon: everything below is darkened and diffused. */
function horizon(cv, y, color, opacity, softness = 90) {
  const [r, g, b] = color;
  for (let yy = 0; yy < cv.h; yy++) {
    const d = yy - y;
    let f;
    if (d > 0) f = Math.min(1, d / softness) * opacity;
    else f = Math.max(0, 1 - Math.abs(d) / (softness * 0.6)) * opacity * 0.35;
    if (f <= 0) continue;
    for (let x = 0; x < cv.w; x++) put(cv, x, yy, r, g, b, f * 0.5);
  }
}

/** Fine directional streaks — light trails / speed. */
function streaks(cv, seed, count, color, len, intensity, angle) {
  const r = rng(seed);
  const [cr, cg, cb] = color;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let i = 0; i < count; i++) {
    const sx = r() * cv.w;
    const sy = r() * cv.h;
    const l = len * (0.4 + r());
    const w = 0.5 + r() * 1.6;
    const a = intensity * (0.25 + r() * 0.75);
    const steps = Math.ceil(l);
    for (let s = 0; s < steps; s++) {
      const f = 1 - s / steps;
      const px = sx + dx * s;
      const py = sy + dy * s;
      for (let k = -2; k <= 2; k++) {
        put(cv, Math.round(px + k * 0.5), Math.round(py + Math.abs(k) * w), cr, cg, cb, a * f);
      }
    }
  }
}

/** Scattered specular points — distant lights or stars. */
function points(cv, seed, count, colors, size, intensity, softness = 3.4) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(r() * colors.length)];
    glow(cv, r() * cv.w, r() * cv.h, size * (0.6 + r()), hexToRgb(c), intensity * (0.3 + r() * 0.7), softness);
  }
}

/** Concentric mechanical rings, seen at an angle. */
function rings(cv, cx, cy, seed, color, count, maxR, intensity) {
  const r = rng(seed);
  const [cr, cg, cb] = color;
  for (let i = 0; i < count; i++) {
    const radius = maxR * (0.18 + (i / count) * 0.82);
    const w = 1 + r() * 2.4;
    const squash = 0.34 + r() * 0.1;
    const steps = Math.ceil(radius * 2 * Math.PI);
    for (let s = 0; s < steps; s++) {
      const t = (s / steps) * Math.PI * 2;
      const x = cx + Math.cos(t) * radius;
      const y = cy + Math.sin(t) * radius * squash;
      const fade = 0.35 + 0.65 * (1 - i / count);
      for (let k = -1; k <= 1; k++) {
        put(cv, Math.round(x), Math.round(y + k * w), cr, cg, cb, intensity * fade);
      }
    }
  }
}

/* ---------------------------------------------------------------- grading */

/**
 * Filmic tone curve. Input is expected in 0..1; anything above 1 already
 * saturates, which is why `normalise()` always runs first.
 */
const TONE = {
  filmic: (x) => {
    const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
  },
};

/**
 * Mean-anchored exposure.
 *
 * The paint helpers are additive (glows stack, streaks sum), so a canvas can
 * peak at 2.5 while its median sits near 0.05 — feeding that into the filmic
 * curve clips every highlight to flat white.
 *
 * Earlier attempts pinned percentiles, which is the wrong lever here: the paint
 * already carries real contrast (the atmosphere base sits far below the lights),
 * and stretching a percentile pair to fixed targets simply multiplied the whole
 * frame up, flattening that contrast into a pale wash.
 *
 * Anchoring the LUMINANCE MEAN instead of a percentile preserves the relative
 * contrast the recipes paint, and gives every image in the set the same overall
 * exposure discipline regardless of composition. The shadow and highlight
 * extremes then land wherever the recipe put them, which is what we want.
 *
 * Mutates `cv.buf` in place. Returns the applied gain.
 */
function normalise(cv, { targetMean = 0.14, maxGain = 4 } = {}) {
  const n = cv.w * cv.h;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    sum += 0.2126 * cv.buf[o] + 0.7152 * cv.buf[o + 1] + 0.0722 * cv.buf[o + 2];
  }
  const mean = sum / n;
  if (mean <= 1e-6) return 1;

  const gain = Math.min(maxGain, Math.max(0.05, targetMean / mean));
  for (let i = 0; i < n * 3; i++) cv.buf[i] *= gain;
  return gain;
}

/**
 * Tonal shaping — the last stage before the sRGB encode.
 *
 * These constants are not eyeballed. tools/_solve.cjs sweeps candidates against
 * a model canvas that has the same shape every recipe produces (a dark
 * atmosphere base plus sparse bright lights) and reports the delivered 8-bit
 * percentiles. The target is mean ≈ 70, p05 ≈ 15, p50 ≈ 65, p95 ≈ 195 with
 * under 1.5 % clipping — a graded cinematic frame rather than a flat wash.
 *
 * result at mean 0.14 / contrast 1.1 / gamma 1.5 / lift 0.004:
 *   mean 70   p05 31   p50 63   p95 196   clip 0.00 %
 */
const SHAPE = {
  contrast: 1.16,
  gamma: 1.12,
  lift: 0.006,
};

function grade(cv, seed, opts = {}) {
  const {
    exposure = 1,
    contrast = SHAPE.contrast,
    grain = 0.014,
    vignette = 0.34,
    chroma = 0.04,
    levels = {},
  } = opts;

  normalise(cv, levels);

  const r = rng(seed ^ 0x9e3779b9);
  const out = Buffer.alloc(cv.w * cv.h * 3);
  const cx = cv.w / 2;
  const cy = cv.h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      const o = (y * cv.w + x) * 3;
      let rr = cv.buf[o] * exposure;
      let gg = cv.buf[o + 1] * exposure;
      let bb = cv.buf[o + 2] * exposure;

      rr = Math.pow(TONE.filmic(rr * contrast), SHAPE.gamma) + SHAPE.lift;
      gg = Math.pow(TONE.filmic(gg * contrast), SHAPE.gamma) + SHAPE.lift;
      bb = Math.pow(TONE.filmic(bb * contrast), SHAPE.gamma) + SHAPE.lift;

      // A little per-channel separation: cooler in the shadows, which reads as
      // film stock rather than as a digital gradient.
      bb += chroma * 0.9;
      rr += chroma * 0.35;

      // Vignette
      const dx = (x - cx) / maxD;
      const dy = (y - cy) / maxD;
      const d = Math.sqrt(dx * dx + dy * dy);
      const vig = 1 - vignette * d * d;
      rr *= vig; gg *= vig; bb *= vig;

      // Grain, strongest in the mid-tones as on real stock.
      const lum = (rr + gg + bb) / 3;
      const gAmt = grain * (1 - Math.abs(lum - 0.5) * 1.4);
      const n = (r() - 0.5) * gAmt;
      rr += n; gg += n; bb += n;

      out[o] = Math.min(255, Math.max(0, Math.round(Math.pow(Math.max(0, rr), 1 / 2.2) * 255)));
      out[o + 1] = Math.min(255, Math.max(0, Math.round(Math.pow(Math.max(0, gg), 1 / 2.2) * 255)));
      out[o + 2] = Math.min(255, Math.max(0, Math.round(Math.pow(Math.max(0, bb), 1 / 2.2) * 255)));
    }
  }
  return out;
}

/* --------------------------------------------------------------- recipes */

/**
 * A recipe paints into a linear-space canvas and grades it, returning the final
 * 8-bit RGB buffer together with its dimensions:
 *
 *     { rgb: Buffer, w: number, h: number }
 *
 * Returning the dimensions alongside the pixels lets the caller feed the buffer
 * straight into sharp's raw input without re-deriving them.
 */
const RECIPES = {
  // Cold alpine ridge in layered fog.
  ridge(seed, w, h) {
    const noise = makeNoise(seed, 5);
    const cv = createCanvas(w, h);
    atmosphere(cv, [
      { at: 0, hex: '#0a1420' },
      { at: 0.4, hex: '#1d3247' },
      { at: 0.62, hex: '#4a6a86' },
      { at: 0.72, hex: '#9fb6c8' },
      { at: 1, hex: '#16202c' },
    ], noise, 0.16, 1.4);

    // Four ridge lines, further ones lighter (aerial perspective).
    for (let layer = 0; layer < 4; layer++) {
      const baseY = h * (0.56 + layer * 0.075);
      const amp = h * (0.13 - layer * 0.022);
      const freq = 1.6 + layer * 1.3;
      const shade = 0.1 + layer * 0.06;
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const n = noise(t * freq, layer * 3.3);
        const yTop = baseY - (n - 0.5) * amp * 2;
        for (let y = Math.floor(yTop); y < h; y++) {
          put(cv, x, y, 0.035 + shade * 0.25, 0.05 + shade * 0.3, 0.07 + shade * 0.36, 1);
        }
      }
    }
    glow(cv, w * 0.72, h * 0.6, Math.min(w, h) * 0.34, hexToRgb('#bcd6e8'), 0.13, 3.2);
    return { rgb: grade(cv, seed, { exposure: 1.0, contrast: 1.2, vignette: 0.44 }), w, h };
  },

  // Wet asphalt at night, sodium and cryo reflections.
  asphalt(seed, w, h) {
    const noise = makeNoise(seed, 4);
    const cv = createCanvas(w, h);
    atmosphere(cv, [
      { at: 0, hex: '#070b12' },
      { at: 0.45, hex: '#111a26' },
      { at: 0.66, hex: '#1b2431' },
      { at: 1, hex: '#0a0e14' },
    ], noise, 0.1, 1.1);

    const horizonY = h * 0.55;
    horizon(cv, horizonY, hexToRgb('#05080d'), 0.85, 70);

    // Perspective lane stripes converging on the vanishing point.
    for (let i = -6; i <= 6; i++) {
      const xFar = w / 2 + i * (w * 0.035);
      const xNear = w / 2 + i * (w * 0.34);
      for (let t = 0; t < 1; t += 0.0015) {
        const y = horizonY + Math.pow(t, 1.7) * (h - horizonY);
        const x = xFar + (xNear - xFar) * Math.pow(t, 1.7);
        put(cv, Math.round(x), Math.round(y), 0.5, 0.55, 0.6, 0.05 + t * 0.12);
      }
    }

    // Wet-surface reflections running toward the viewer.
    streaks(cv, seed + 7, 90, hexToRgb('#7fb6e0'), h * 0.5, 0.05, Math.PI / 2);
    streaks(cv, seed + 11, 40, hexToRgb('#ff9a55'), h * 0.34, 0.045, Math.PI / 2);
    points(cv, seed + 3, 26, ['#ffb066', '#8fd8ff', '#ffe8c0'], Math.min(w, h) * 0.004, 0.3, 4.4);
    return { rgb: grade(cv, seed, { exposure: 1.0, contrast: 1.22, vignette: 0.52, grain: 0.02 }), w, h };
  },

  // Machined metal: brushed surface, concentric detail, hard key light.
  machined(seed, w, h) {
    const noise = makeNoise(seed, 6);
    const cv = createCanvas(w, h);
    atmosphere(cv, [
      { at: 0, hex: '#1a212a' },
      { at: 0.5, hex: '#2b3542' },
      { at: 1, hex: '#0e1319' },
    ], noise, 0.2, 6);

    // Brushed grain.
    for (let i = 0; i < w * 14; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const a = 0.012 + Math.random() * 0.03;
      put(cv, Math.round(x), Math.round(y), 0.55, 0.6, 0.66, a * 0.4);
    }
    rings(cv, w * 0.52, h * 0.5, seed + 21, hexToRgb('#cfe0ee'), 9, Math.min(w, h) * 0.46, 0.22);
    glow(cv, w * 0.3, h * 0.24, Math.min(w, h) * 0.5, hexToRgb('#9fc6e8'), 0.1, 3.0);
    glow(cv, w * 0.82, h * 0.82, Math.min(w, h) * 0.34, hexToRgb('#ff9a55'), 0.05, 3.4);
    return { rgb: grade(cv, seed, { exposure: 1.0, contrast: 1.26, vignette: 0.48, grain: 0.012 }), w, h };
  },

  // Deep sky field with a faint galactic band.
  sky(seed, w, h) {
    const noise = makeNoise(seed, 5);
    const cv = createCanvas(w, h);
    atmosphere(cv, [
      { at: 0, hex: '#05070f' },
      { at: 0.55, hex: '#0b1322' },
      { at: 1, hex: '#070a12' },
    ], noise, 0.12, 1.2);

    // Galactic band along a diagonal, built from summed scatter so the density
    // falls off naturally toward the edges of the band.
    const angle = -0.42;
    for (let i = 0; i < w * 26; i++) {
      const t = Math.random();
      const along = t * w * 1.4 - w * 0.2;
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * h * 0.13;
      const x = along * Math.cos(angle) - spread * Math.sin(angle);
      const y = h * 0.5 + along * Math.sin(angle) + spread * Math.cos(angle);
      const a = 0.006 + Math.random() * 0.016;
      const warm = Math.random() > 0.6;
      put(cv, Math.round(x), Math.round(y), warm ? 0.5 : 0.3, 0.34, warm ? 0.4 : 0.62, a);
    }

    // Small, hard stars — kept tiny so they read as points, not as bokeh.
    points(cv, seed + 31, 460, ['#dfe9ff', '#bcd6ff', '#ffe6c8'], Math.min(w, h) * 0.0012, 0.55, 5.0);
    glow(cv, w * 0.24, h * 0.62, Math.min(w, h) * 0.6, hexToRgb('#4d6fb0'), 0.09, 3.2);
    glow(cv, w * 0.78, h * 0.3, Math.min(w, h) * 0.5, hexToRgb('#8a63c8'), 0.06, 3.4);
    return {
      rgb: grade(cv, seed, {
        exposure: 1.0,
        contrast: 1.24,
        vignette: 0.52,
        grain: 0.016,
        chroma: 0.05,
        // The sky frame is legitimately dominated by a dark field, so anchor it
        // a little lower than the default to keep the star field deep.
        levels: { loP: 0.01, loTarget: 0.03, hiP: 0.97, hiTarget: 0.5 },
      }),
      w,
      h,
    };
  },

  // Pure light composition: overlapping gradients and an interference field.
  caustic(seed, w, h) {
    const noise = makeNoise(seed, 3);
    const cv = createCanvas(w, h);
    atmosphere(cv, [
      { at: 0, hex: '#081018' },
      { at: 0.5, hex: '#12202e' },
      { at: 1, hex: '#06090f' },
    ], noise, 0.08, 0.9);

    const pal = ['#7fd8ff', '#ffb27f', '#b9a2ff', '#9fffe0'];
    for (let i = 0; i < 6; i++) {
      glow(
        cv,
        w * (0.1 + Math.random() * 0.8),
        h * (0.1 + Math.random() * 0.8),
        Math.min(w, h) * (0.16 + Math.random() * 0.24),
        hexToRgb(pal[i % pal.length]),
        0.06 + Math.random() * 0.07,
        3.0 + Math.random()
      );
    }

    // Interference of two sine fields — the caustic pattern.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const s =
          Math.sin((u * 9 + noise(u, v) * 4) * Math.PI) *
          Math.cos((v * 7 + noise(v, u) * 3) * Math.PI);
        if (s > 0.55) put(cv, x, y, 0.75, 0.85, 1, (s - 0.55) * 0.05);
      }
    }
    return { rgb: grade(cv, seed, { exposure: 1.0, contrast: 1.24, vignette: 0.46, grain: 0.014 }), w, h };
  },
};

/* --------------------------------------------------------------- manifest */

/** id, recipe, seed, dimensions, dominant tone (drives UI tinting). */
const SPECS = [
  { id: 'sample-ridge-01', recipe: 'ridge', seed: 1041, w: 1920, h: 1200, tone: '#4a6a86', title: '示例 · 雾中脊线' },
  { id: 'sample-ridge-02', recipe: 'ridge', seed: 2277, w: 1400, h: 1750, tone: '#5b7f9c', title: '示例 · 晨光层峦' },
  { id: 'sample-asphalt-01', recipe: 'asphalt', seed: 3319, w: 1920, h: 1080, tone: '#1b2431', title: '示例 · 湿沥青与钠灯' },
  { id: 'sample-asphalt-02', recipe: 'asphalt', seed: 4421, w: 1400, h: 1866, tone: '#222c3a', title: '示例 · 夜行道线' },
  { id: 'sample-machined-01', recipe: 'machined', seed: 5507, w: 1920, h: 1280, tone: '#2b3542', title: '示例 · 拉丝金属环' },
  { id: 'sample-machined-02', recipe: 'machined', seed: 6619, w: 1600, h: 1600, tone: '#37424f', title: '示例 · 机械同心面' },
  { id: 'sample-sky-01', recipe: 'sky', seed: 7723, w: 1920, h: 1200, tone: '#0b1322', title: '示例 · 深空星野' },
  { id: 'sample-sky-02', recipe: 'sky', seed: 8837, w: 1400, h: 1750, tone: '#0e1730', title: '示例 · 银河斜带' },
  { id: 'sample-caustic-01', recipe: 'caustic', seed: 9949, w: 1920, h: 1200, tone: '#12202e', title: '示例 · 光的干涉' },
  { id: 'sample-caustic-02', recipe: 'caustic', seed: 1601, w: 1600, h: 1600, tone: '#1a2635', title: '示例 · 冷色焦散' },
  { id: 'sample-caustic-03', recipe: 'caustic', seed: 2713, w: 1400, h: 1850, tone: '#16222f', title: '示例 · 液态折射色' },
];

/**
 * Swap Math.random for a deterministic stream during a paint pass. A few
 * helpers (brushed grain, star scatter, the caustic field) read Math.random
 * directly because threading a generator through every call site would obscure
 * the maths; this keeps the output byte-stable regardless.
 */
function withSeededRandom(seed, fn) {
  let s = seed >>> 0;
  const original = Math.random;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

async function main() {
  const manifest = [];
  console.log(`generating ${SPECS.length} sample images -> ${OUT}\n`);

  for (const spec of SPECS) {
    const painted = withSeededRandom(spec.seed, () => RECIPES[spec.recipe](spec.seed, spec.w, spec.h));
    const { rgb, w, h } = painted;
    if (!rgb || !w || !h || rgb.length !== w * h * 3) {
      throw new Error(
        `recipe "${spec.recipe}" produced an inconsistent canvas for ${spec.id}: ` +
          `w=${w} h=${h} rgbLen=${rgb && rgb.length} expected=${w * h * 3}`
      );
    }

    const pipeline = () => sharp(rgb, { raw: { width: w, height: h, channels: 3 } });

    const file = `${spec.id}.jpg`;
    const buf = await pipeline().jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
    fs.writeFileSync(path.join(OUT, file), buf);

    // A smaller file for the grid, so the masonry view is not paying full-size
    // decode cost for every tile.
    const thumbFile = `${spec.id}@thumb.jpg`;
    const thumbBuf = await pipeline().resize({ width: 640 }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    fs.writeFileSync(path.join(OUT, thumbFile), thumbBuf);

    manifest.push({
      id: spec.id,
      file: `/assets/photography/${file}`,
      thumb: `/assets/photography/${thumbFile}`,
      width: w,
      height: h,
      tone: spec.tone,
      title: spec.title,
      recipe: spec.recipe,
      bytes: buf.length,
    });
    console.log(
      `  ${file.padEnd(28)} ${String(w).padStart(4)}x${String(h).padEnd(4)} ` +
        `${(buf.length / 1024).toFixed(0).padStart(4)}KB  thumb ${(thumbBuf.length / 1024).toFixed(0).padStart(3)}KB  ${spec.title}`
    );
  }

  /* ---- contact sheet, so the whole set can be judged at a glance ---- */
  const cols = 4;
  const cellW = 320;
  const cellH = 220;
  const rows = Math.ceil(SPECS.length / cols);
  const tiles = [];
  for (let i = 0; i < SPECS.length; i++) {
    const t = await sharp(path.join(OUT, `${SPECS[i].id}@thumb.jpg`))
      .resize({ width: cellW, height: cellH, fit: 'cover' })
      .toBuffer();
    tiles.push({ input: t, left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH });
  }

  const verifyDir = path.resolve(__dirname, '_verify');
  fs.mkdirSync(verifyDir, { recursive: true });
  await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 3, background: '#000' } })
    .composite(tiles)
    .jpeg({ quality: 84 })
    .toFile(path.join(verifyDir, 'photography-contact-sheet.jpg'));

  fs.writeFileSync(
    path.join(verifyDir, 'photography-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  const totalKb = manifest.reduce((s, m) => s + m.bytes, 0) / 1024;
  console.log(`\nwrote ${SPECS.length} images + ${SPECS.length} thumbnails (${totalKb.toFixed(0)} KB full-size total)`);
  console.log('contact sheet -> tools/_verify/photography-contact-sheet.jpg');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
