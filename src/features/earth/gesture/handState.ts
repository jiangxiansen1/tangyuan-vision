/**
 * handState.ts — the dual-hand gesture STATE MACHINE, as a pure reducer.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * The recognition loop lives in gestureSession.ts and only exists while a camera
 * runs. The decisions it needs — which gesture wins, how long a hover must hold
 * before a name shows, when a region is confirmed, when tracking is "frozen" —
 * are pure functions of (measurements, elapsed time). Keeping them here means the
 * arbitration, timing, debounce and loss/recovery rules are unit-testable WITHOUT
 * a camera, and the runtime loop only has to feed real numbers in.
 *
 * INPUT IS REAL MEASUREMENT ONLY
 * Every field is a normalised value the recogniser can actually produce (hand
 * presence, filtered anchors, pinch/thumb/openness strength, the region id under
 * the reticle). Nothing here invents a detected hand or a fake timer state.
 *
 * PRIORITY (strict, single decision per frame)
 *   off  <  lost(frozen)  <  reset(thumb-up hold)  <  select(right pinch)
 *        <  dual(span zoom)  <  single(left rotate)
 * Right-pinch selection always freezes all zoom. Left-hand rotation stays live in
 * both single and select modes.
 */

export type HandMode = 'off' | 'waiting' | 'single' | 'dual' | 'select' | 'reset' | 'lost';

export interface HandSample {
  /** Camera + local model ready and the loop is running. */
  ready: boolean;
  left: boolean;
  right: boolean;
  /** Filtered, normalised horizontal anchor of the left hand (0..1). */
  leftX: number;
  /** Filtered, normalised vertical anchor of the left hand (0..1, 0 = top). */
  leftY: number;
  /** Normalised distance between the two hands (only meaningful with both). */
  span: number;
  /** Right-hand thumb–index pinch strength, 0 (open) .. 1 (closed). */
  pinch: number;
  /** Right-hand thumb-up strength, 0..1. */
  thumbUp: number;
  /** Right-hand finger openness (spread), normalised 0..1. */
  openness: number;
  /** Region id under the reticle this frame, or null when nothing is hit. */
  targetId: string | null;
}

export interface HandOutput {
  mode: HandMode;
  /** Degrees to turn this frame (left-hand rotation + its short inertia). */
  rotateDeg: number;
  /** Degrees to tilt vertically this frame (left hand moving up or down). */
  tiltDeg: number;
  /** Multiplier for the camera distance (both-hand span + finger fine-tune). */
  zoomFactor: number;
  /** True once a region has been hovered long enough to name it. */
  showName: boolean;
  /** Region id to confirm this frame (fires exactly once per held target). */
  confirmId: string | null;
  /** True on the single frame the thumb-up hold completes. */
  reset: boolean;
  /** 0..1 progress for the reticle's confirm ring. */
  selectProgress: number;
  /** Short, low-presence hint for the HUD ('' when nothing to say). */
  hint: string;
}

export interface HandMachine {
  step(sample: HandSample, dtMs: number): HandOutput;
}

/** Timing, thresholds and gains — one place, no spread-out magic numbers. */
export const HAND = {
  NAME_MS: 250,
  CONFIRM_MS: 800,
  TARGET_GRACE_MS: 150,
  FREEZE_MS: 500,
  HINT_MS: 2000,
  RESET_MS: 1000,
  MOVE_DZ: 0.004,
  /*
   * Raised from 520 on the visitor's request: the previous gain needed a wide
   * sweep of the arm to turn the globe a useful amount. MAX_ROT_STEP rose with
   * it, otherwise the higher gain would simply clip against the old per-frame
   * ceiling and feel identical.
   */
  ROTATE_GAIN: 950,
  MAX_ROT_STEP: 15,
  INERTIA_HALFLIFE: 0.5,
  MIN_INERTIA_VEL: 12,
  SPAN_DZ: 0.02,
  SPAN_GAIN: 6.0,
  OPEN_DZ: 0.06,
  OPEN_GAIN: 1.1,
  MAX_ZOOM_STEP: 0.09,
  PINCH_ON: 0.55,
  PINCH_OFF: 0.35,
  THUMB_ON: 0.6,
  THUMB_OFF: 0.4,
} as const;

function dz(v: number, t: number): number {
  return Math.abs(v) <= t ? 0 : v - Math.sign(v) * t;
}
function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function createHandMachine(): HandMachine {
  let prevLeftX = 0;
  let prevLeftY = 0;
  let haveLeft = false;
  let vel = 0; // deg/second, left-hand rotational inertia
  let prevSpan = 0;
  let haveSpan = false;
  let prevOpen = 0;
  let haveOpen = false;
  let pinching = false;
  let thumbMs = 0;
  let resetFired = false;
  let targetId: string | null = null;
  let targetMs = 0;
  let nullMs = 0;
  let confirmed = false;
  let lostMs = 0;

  function resetBaselines() {
    haveLeft = false;
    haveSpan = false;
    haveOpen = false;
    vel = 0;
    pinching = false;
  }

  function step(s: HandSample, dtMs: number): HandOutput {
    const out: HandOutput = {
      mode: 'off', rotateDeg: 0, tiltDeg: 0, zoomFactor: 1, showName: false,
      confirmId: null, reset: false, selectProgress: 0, hint: '',
    };
    const dt = Math.max(0.001, dtMs / 1000);
    if (!s.ready) {
      resetBaselines();
      targetId = null; targetMs = 0; nullMs = 0; confirmed = false; lostMs = 0;
      return out; // 'off'
    }

    const anyHand = s.left || s.right;
    if (!anyHand) {
      lostMs += dtMs;
      if (lostMs >= HAND.FREEZE_MS) {
        // Frozen: keep everything, drive nothing.
        resetBaselines();
        out.mode = 'lost';
        out.hint = lostMs >= HAND.HINT_MS ? '未识别到手部，手势已暂停。' : '';
        return out;
      }
      // Short gap: keep left inertia gliding, decay it.
      vel *= Math.pow(0.5, dt / HAND.INERTIA_HALFLIFE);
      if (Math.abs(vel) < HAND.MIN_INERTIA_VEL) vel = 0;
      out.rotateDeg = vel * dt;
      out.mode = 'waiting';
      out.zoomFactor = 1;
      return out;
    }
    lostMs = 0;

    /* --- thumb-up hold → reset (highest action priority) --- */
    if (s.right && s.thumbUp >= HAND.THUMB_ON) {
      thumbMs += dtMs;
      if (thumbMs >= HAND.RESET_MS && !resetFired) {
        resetFired = true;
        out.reset = true;
      }
      out.mode = 'reset';
      out.hint = thumbMs >= HAND.RESET_MS ? '已重置视角。' : '保持拇指竖起以重置视角…';
      return out; // freeze zoom/select/rotate while confirming
    }
    if (s.thumbUp < HAND.THUMB_OFF) {
      thumbMs = 0;
      resetFired = false;
    }

    /* --- left-hand horizontal rotation (allowed in single + select) --- */
    if (s.left) {
      if (!haveLeft) {
        prevLeftX = s.leftX;
        prevLeftY = s.leftY;
        haveLeft = true;
        vel = 0;
      } else {
        const dx = dz(s.leftX - prevLeftX, HAND.MOVE_DZ);
        const dy = dz(s.leftY - prevLeftY, HAND.MOVE_DZ);
        prevLeftX = s.leftX;
        prevLeftY = s.leftY;
        /*
         * Vertical uses a LOWER gain than horizontal on purpose: latitude only
         * spans -90..90, so matching the horizontal gain would let a small hand
         * movement slam the view from pole to pole. It also gets no inertia —
         * an overshooting tilt is disorienting in a way an overshooting spin is
         * not.
         */
        out.tiltDeg = clamp(
          dy * HAND.ROTATE_GAIN * 0.85,
          -HAND.MAX_ROT_STEP * 0.85,
          HAND.MAX_ROT_STEP * 0.85
        );
        const stepDeg = clamp(dx * HAND.ROTATE_GAIN, -HAND.MAX_ROT_STEP, HAND.MAX_ROT_STEP);
        vel = stepDeg / dt;
        out.rotateDeg = stepDeg;
      }
    } else {
      haveLeft = false;
      vel *= Math.pow(0.5, dt / HAND.INERTIA_HALFLIFE);
      if (Math.abs(vel) < HAND.MIN_INERTIA_VEL) vel = 0;
      out.rotateDeg = vel * dt;
      out.tiltDeg = 0;
    }

    /* --- right pinch → selection mode; freezes ALL zoom --- */
    if (pinching) pinching = s.pinch > HAND.PINCH_OFF;
    else pinching = s.right && s.pinch >= HAND.PINCH_ON;

    if (pinching) {
      haveSpan = false;
      haveOpen = false;
      out.zoomFactor = 1;
      out.mode = 'select';
      // Region hover timing (two stages): name ~0.25s, confirm ~0.8s.
      if (s.targetId) {
        nullMs = 0;
        if (s.targetId === targetId) targetMs += dtMs;
        else {
          targetId = s.targetId;
          targetMs = 0;
          confirmed = false;
        }
      } else {
        // Only reset the countdown when the reticle has left for a moment.
        nullMs += dtMs;
        if (nullMs >= HAND.TARGET_GRACE_MS) {
          targetId = null;
          targetMs = 0;
          confirmed = false;
        }
      }
      if (targetId) {
        out.showName = targetMs >= HAND.NAME_MS;
        out.selectProgress = clamp(targetMs / HAND.CONFIRM_MS, 0, 1);
        if (targetMs >= HAND.CONFIRM_MS && !confirmed) {
          confirmed = true;
          out.confirmId = targetId;
        }
      }
      out.hint = targetId ? '稳定指向以选中地区…' : '右手捏合：移动准星到目标地区';
      return out;
    }
    // Pinch released: re-arm for the next hold; do NOT clear any shown panel here.
    confirmed = false;
    targetId = null;
    targetMs = 0;
    nullMs = 0;

    /* --- zoom: both-hand span (main) + finger openness (fine-tune) --- */
    let factor = 1;
    if (s.left && s.right) {
      if (!haveSpan) {
        prevSpan = s.span;
        haveSpan = true;
      } else {
        const ds = dz(s.span - prevSpan, HAND.SPAN_DZ);
        prevSpan = s.span;
        // Hands apart → closer (factor < 1); hands together → further.
        const f = clamp(1 - ds * HAND.SPAN_GAIN, 1 - HAND.MAX_ZOOM_STEP, 1 + HAND.MAX_ZOOM_STEP);
        if (f !== 1) factor *= f;
      }
      if (s.right) {
        if (!haveOpen) {
          prevOpen = s.openness;
          haveOpen = true;
        } else {
          const dop = dz(s.openness - prevOpen, HAND.OPEN_DZ);
          prevOpen = s.openness;
          const f = clamp(1 - dop * HAND.OPEN_GAIN, 0.98, 1.02);
          if (f !== 1) factor *= f;
        }
      }
      out.mode = 'dual';
    } else {
      haveSpan = false;
      haveOpen = false;
      prevSpan = s.span;
      out.mode = s.left || s.right ? 'single' : 'waiting';
    }
    out.zoomFactor = factor;
    out.hint = s.left && s.right ? '双手间距缩放 · 手指张合微调' : '左手左右移动旋转地球';
    return out;
  }

  return { step };
}