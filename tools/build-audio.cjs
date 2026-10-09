/**
 * build-audio.cjs — generate the optional ambient bed.
 *
 * WHY GENERATED RATHER THAN DOWNLOADED
 * The brief forbids paid audio APIs and unlicensed material. Rather than ship a
 * placeholder pointing at some track of unclear provenance, this synthesises a
 * genuinely free ambience from first principles: a slow, dark drone built from a
 * few detuned sine partials plus filtered noise, written as a stereo WAV.
 *
 * It is intentionally quiet and static — a bed, not a soundtrack. Sleep-friendly
 * and impossible to get tired of.
 *
 * The site treats this file as OPTIONAL. If it is absent, the music toggle still
 * works and simply reports that the file was not provided (see src/lib/sound.ts).
 * Deleting the file is a supported configuration, not a broken one.
 *
 * Usage:  tools\tv.cmd node tools\build-audio.cjs        (writes ambient.wav)
 *         Additionally convert to .m4a/.mp3 yourself if you want smaller files —
 *         the site requests /assets/audio/ambient.m4a first, then .wav.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'audio');
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Kept deliberately small. This file is an OPTIONAL, on-demand fetch — it is only
 * requested when a visitor turns background music on — but 6 MB of uncompressed
 * PCM for an ambient bed is still poor manners, so the defaults are chosen to
 * land around 2 MB:
 *
 *   24 s × 24 000 Hz × 2 ch × 16 bit = 2.3 MB
 *
 * 24 s is long enough that the loop is not noticeable for a bed this static, and
 * 24 kHz is transparent for material whose highest partial is 220 Hz plus
 * low-passed noise. Converting to AAC afterwards (see the README this script
 * writes) brings it under 300 KB with no audible change.
 */
const SAMPLE_RATE = 24000;
const DURATION = 24; // seconds — loops seamlessly
const CHANNELS = 2;

/** Write a stereo float pair as a 16-bit PCM WAV. */
function writeWav(file, left, right, sampleRate) {
  const frames = left.length;
  const dataBytes = frames * CHANNELS * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * CHANNELS * 2, 28); // byte rate
  buf.writeUInt16LE(CHANNELS * 2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  let o = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(Math.round(l * 32767), o);
    buf.writeInt16LE(Math.round(r * 32767), o + 2);
    o += 4;
  }

  fs.writeFileSync(file, buf);
  return buf.length;
}

/**
 * Partial frequencies chosen to be mutually consonant: a low fundamental, its
 * fifth and its octave, plus two very quiet higher partials that give the drone
 * a little air without making it bright.
 *
 * Each frequency is snapped so that an integer number of cycles fits in the
 * loop length — otherwise the loop point clicks audibly.
 */
function snapToLoop(freq, seconds) {
  const cycles = Math.round(freq * seconds);
  return cycles / seconds;
}

/** One-pole low-pass state for the noise "air" layer. Declared before use. */
let airL = 0;
let airR = 0;

function build() {
  const frames = SAMPLE_RATE * DURATION;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  const partials = [
    { f: 55.0, amp: 0.34, pan: -0.15 }, // A1
    { f: 82.5, amp: 0.2, pan: 0.12 }, // E2, a fifth up
    { f: 110.0, amp: 0.13, pan: 0.2 }, // A2
    { f: 164.8, amp: 0.055, pan: -0.25 }, // E3
    { f: 220.0, amp: 0.03, pan: 0.3 }, // A3, barely there
  ];

  // Slow amplitude movement, so the drone breathes instead of sitting static.
  // Every rate is also snapped to the loop length.
  const lfos = [
    { rate: snapToLoop(1 / 11, DURATION), depth: 0.22, phase: 0 },
    { rate: snapToLoop(1 / 17, DURATION), depth: 0.16, phase: 2.1 },
    { rate: snapToLoop(1 / 7, DURATION), depth: 0.09, phase: 4.3 },
  ];

  // A deterministic noise source, for the air layer.
  let seed = 0x1f2e3d4c;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    let l = 0;
    let r = 0;

    for (const p of partials) {
      const f = snapToLoop(p.f, DURATION);
      // A little per-partial detune drift, so no two partials stay locked in
      // phase and the drone never develops an obvious beating throb.
      const drift = Math.sin((2 * Math.PI * t) / DURATION * 3) * 0.0016;
      const v = Math.sin(2 * Math.PI * (f + f * drift) * t) * p.amp;

      const gain = 1 + lfos.reduce((acc, lfo) => acc + Math.sin(2 * Math.PI * lfo.rate * t + lfo.phase) * lfo.depth, 0) - 0.4;

      l += v * gain * (0.5 - p.pan * 0.5);
      r += v * gain * (0.5 + p.pan * 0.5);
    }

    // Filtered noise: a one-pole low-pass applied to white noise, which is the
    // cheapest way to get "air" rather than "hiss".
    const n = rnd();
    airL = airL + (n - airL) * 0.0016;
    airR = airR + (rnd() - airR) * 0.0016;
    l += airL * 0.5;
    r += airR * 0.5;

    left[i] = l;
    right[i] = r;
  }

  // Normalise to a comfortable peak, then fade the loop point so it is seamless.
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const target = 0.72;
  const norm = peak > 0 ? target / peak : 1;

  const fade = Math.min(Math.floor(SAMPLE_RATE * 1.5), Math.floor(frames / 8));
  for (let i = 0; i < frames; i++) {
    left[i] *= norm;
    right[i] *= norm;
  }
  for (let i = 0; i < fade; i++) {
    // Equal-power-ish crossfade: the tail is mixed into the head so the file can
    // loop without a discontinuity.
    const w = i / fade;
    const j = frames - fade + i;
    left[i] = left[i] * w + left[j] * (1 - w);
    right[i] = right[i] * w + right[j] * (1 - w);
  }

  return { left, right, frames };
}

const { left, right } = build();

const wavPath = path.join(OUT_DIR, 'ambient.wav');
const bytes = writeWav(wavPath, left, right, SAMPLE_RATE);

fs.writeFileSync(
  path.join(OUT_DIR, 'README.md'),
  `# Audio assets

## \`ambient.wav\` — generated

This file is generated by \`tools/build-audio.cjs\`. It is a synthesised
ambient drone (5 partials + filtered noise, ${DURATION}s, ${SAMPLE_RATE} Hz, stereo,
loop-safe). No third-party material is involved, so there is no licensing
question.

**It is optional.** Delete it and the site still works completely: the music
toggle stays functional and reports that the file was not provided, rather than
failing silently. See \`src/lib/sound.ts\`.

## Shrinking it

WAV is uncompressed. Convert it for a production site:

\`\`\`bash
ffmpeg -i ambient.wav -c:a aac -b:a 96k ambient.m4a
\`\`\`

The site requests \`ambient.m4a\` first and \`ambient.wav\` as a fallback, so
adding the .m4a alongside this file is enough — no code change needed.

## Replacing it with your own music

Any audio you have the right to publish works. Keep it loop-safe and quiet, drop
it in as \`ambient.m4a\`, and nothing else has to change.

## Interface sound effects

There is no SFX file here on purpose. The interface sounds are synthesised live
with the Web Audio API (see the \`RECIPES\` table in \`src/lib/sound.ts\`), which
means they cost zero bytes to download and have no licensing surface at all.
`,
  'utf8'
);

console.log(`wrote ${path.relative(process.cwd(), wavPath)}`);
console.log(`  ${DURATION}s · ${SAMPLE_RATE} Hz · stereo · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  peak normalised to 0.72, loop crossfaded over ${(1.5).toFixed(1)}s`);
console.log('\nOptional: convert to .m4a for a much smaller file — see the README written alongside it.');
