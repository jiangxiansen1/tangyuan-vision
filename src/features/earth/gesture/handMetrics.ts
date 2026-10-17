/**
 * handMetrics.ts — real MediaPipe landmarks → handState.ts measurements.
 *
 * WHY THIS IS A SEPARATE, PURE-ISH MODULE
 * gestureSession.ts owns the camera. This module owns the arithmetic: turn one
 * frame's REAL landmarks into the normalised HandSample the state machine needs,
 * with smoothing and validity checks. It takes landmark arrays directly (so it is
 * unit-testable with synthetic frames) and holds only simple filter state — no
 * camera, no DOM, no globe.
 *
 * SCALE COMPENSATION
 * Every finger feature is divided by the palm length (wrist 0 → middle MCP 9), so
 * moving closer to the camera or having a larger hand does not shift the numbers.
 * The two-hand span is a distance in the shared normalised frame (both hands use
 * the same frame), which is consistent frame-to-frame.
 *
 * HONESTY
 * These are geometric heuristics on real keypoints. They are NOT validated against
 * a real camera in this environment, and none of them is derived from a made-up
 * pose. Missing / non-finite / too-short landmarks make the measurement INVALID —
 * the previous value is never re-used as if it were the current frame.
 */

export interface Pt {
  x: number;
  y: number;
  z?: number;
}

/** MediaPipe hand landmark indices actually used. */
const WRIST = 0;
const THUMB_CMC = 2;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;
const HAND_LANDMARKS = 21;

export interface HandSample {
  ready: boolean;
  left: boolean;
  right: boolean;
  leftX: number;
  span: number;
  pinch: number;
  thumbUp: number;
  openness: number;
  /** Filtered right-hand anchor, normalised frame coords (0..1). 0 when absent. */
  rightX: number;
  rightY: number;
  targetId: string | null;
}

export interface HandMetricsInput {
  ready: boolean;
  left: Pt[] | null;
  right: Pt[] | null;
  /** Real screen-ray hit for the reticle, or null (Step 3 supplies this). */
  targetId: string | null;
}

export interface HandMetrics {
  measure(input: HandMetricsInput): HandSample;
}

function finite(p: Pt | undefined): boolean {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** A usable hand: 21 points and finite coordinates on the key anchors we read. */
function validHand(h: Pt[] | null): h is Pt[] {
  if (!h || h.length < HAND_LANDMARKS) return false;
  return [WRIST, THUMB_TIP, INDEX_TIP, MIDDLE_MCP, MIDDLE_TIP, RING_TIP, PINKY_TIP].every((i) => finite(h[i]));
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Palm length — the scale-compensation denominator. */
function palmScale(h: Pt[]): number {
  const s = dist(h[WRIST], h[MIDDLE_MCP]);
  return s > 1e-4 ? s : 1e-4;
}

/** Stable palm anchor: centroid of the wrist and the four MCPs. */
function anchor(h: Pt[]): Pt {
  const ids = [WRIST, INDEX_MCP, MIDDLE_MCP, 13, PINKY_MCP]; // 0,5,9,13,17 (ring MCP)
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += h[i].x;
    y += h[i].y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** 1 = thumb and index tips touching, 0 = well apart (scale-normalised). */
function pinchOf(h: Pt[]): number {
  const scale = palmScale(h);
  const r = dist(h[THUMB_TIP], h[INDEX_TIP]) / scale;
  return clamp(1 - r / 1.1, 0, 1);
}

/** 0 = fist, 1 = wide open (mean wrist→fingertip distance, scale-normalised). */
function opennessOf(h: Pt[]): number {
  const scale = palmScale(h);
  const tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
  let sum = 0;
  for (const t of tips) sum += dist(h[WRIST], h[t]) / scale;
  const mean = sum / tips.length;
  return clamp((mean - 0.9) / 0.9, 0, 1);
}

/**
 * Thumb-up score (0..1): thumb extended away from its base, thumb tip pointed up
 * in the image, and the other fingers curled. A flat open palm scores low.
 */
function thumbUpOf(h: Pt[]): number {
  const scale = palmScale(h);
  const extended = clamp((dist(h[THUMB_TIP], h[THUMB_CMC]) / scale - 0.5) / 0.7, 0, 1);
  const raised = clamp((h[WRIST].y - h[THUMB_TIP].y) / scale, 0, 1);
  const curled = 1 - opennessOf(h);
  return clamp(0.45 * extended + 0.35 * raised + 0.2 * curled, 0, 1);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

const SMOOTH = { x: 0.4, span: 0.35, pinch: 0.5, openness: 0.4, thumbUp: 0.5 } as const;

/** Stateful wrapper: geometric features + a light EMA filter + validity. */
export function createHandMetrics(): HandMetrics {
  let haveLeft = false;
  let sx = 0;
  let haveSpan = false;
  let sSpan = 0;
  let haveRight = false;
  let sPinch = 0;
  let sOpen = 0;
  let sThumb = 0;
  let haveRightPos = false;
  let srX = 0;
  let srY = 0;

  function step(v: number, prev: number, alpha: number): number {
    return prev + (v - prev) * alpha;
  }

  return {
    measure(input: HandMetricsInput): HandSample {
      const out: HandSample = {
        ready: input.ready, left: false, right: false, leftX: 0,
        span: 0, pinch: 0, thumbUp: 0, openness: 0, rightX: 0, rightY: 0, targetId: input.targetId,
      };
      if (!input.ready) {
        haveLeft = false; haveSpan = false; haveRight = false; haveRightPos = false;
        return out;
      }

      /* Narrow the optional hands ONCE through the type guard, so the helpers
         only ever receive a validated Pt[] (no `any`, no non-null assertion).
         A missing/!invalid hand keeps its measurements INVALID — the previous
         value is never re-used as if it were the current frame. */
      const lh = input.left;
      const rh = input.right;

      // Left anchor → smoothed normalised x (baseline re-established on re-entry).
      if (validHand(lh)) {
        const a = anchor(lh);
        sx = haveLeft ? step(a.x, sx, SMOOTH.x) : a.x;
        haveLeft = true;
        out.left = true;
        out.leftX = sx;
      } else {
        haveLeft = false;
      }

      // Two-hand span (only when BOTH hands are valid; never from stale anchors).
      if (validHand(lh) && validHand(rh)) {
        const d = dist(anchor(lh), anchor(rh));
        sSpan = haveSpan ? step(d, sSpan, SMOOTH.span) : d;
        haveSpan = true;
        out.span = sSpan;
      } else {
        haveSpan = false;
      }

      // Right-hand pose features (invalid right hand ⇒ pinch/thumb/openness stay 0).
      if (validHand(rh)) {
        const p = pinchOf(rh);
        const o = opennessOf(rh);
        const t = thumbUpOf(rh);
        const ra = anchor(rh);
        if (haveRightPos) { srX = step(ra.x, srX, SMOOTH.x); srY = step(ra.y, srY, SMOOTH.x); }
        else { srX = ra.x; srY = ra.y; }
        haveRightPos = true;
        out.rightX = srX;
        out.rightY = srY;
        if (haveRight) {
          sPinch = step(p, sPinch, SMOOTH.pinch);
          sOpen = step(o, sOpen, SMOOTH.openness);
          sThumb = step(t, sThumb, SMOOTH.thumbUp);
        } else {
          sPinch = p; sOpen = o; sThumb = t;
        }
        haveRight = true;
        out.right = true;
        out.pinch = clamp(sPinch, 0, 1);
        out.openness = clamp(sOpen, 0, 1);
        out.thumbUp = clamp(sThumb, 0, 1);
      } else {
        haveRight = false;
        haveRightPos = false;
      }

      return out;
    },
  };
}