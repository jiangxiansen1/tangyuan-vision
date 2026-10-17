/**
 * gestureSession — the ONE gesture session for the whole earth experience.
 *
 * WHY THIS EXISTS (measured root cause)
 * The gesture control used to live inside the home earth scene. Entering the big
 * globe is a ROUTE CHANGE (`<Link to="/earth">`), so that scene unmounted and its
 * cleanup — plus its "left the viewport" observer — stopped the camera: the
 * visitor had granted permission and the stream was killed by an internal
 * navigation.
 *
 * WHY IT IS CACHED ON globalThis
 * During development a module can be instantiated more than once (HMR rewrites,
 * two specifier spellings). That was measured here: the globe had published its
 * control API (`data-control-ready="true"`) while the session the UI subscribed
 * to still reported no target — two copies of this module, two sets of state.
 * Caching the instance on globalThis makes "one session per document" true by
 * construction, in dev and in the build alike.
 *
 * CONTROL TARGET, RESOLVED PER FRAME
 * Surfaces hand in their `MutableRefObject<GlobeControlApi|null>` (the ref the
 * globe fills on mount and clears on teardown). The loop reads `ref.current`
 * every tick, so after a route change it drives the NEWLY mounted globe and
 * never a disposed one — with no re-permission and no re-wiring.
 */

import type { MutableRefObject } from 'react';
import type { GlobeControlApi } from '@/features/earth/EarthGlobe';
import { createHandMetrics } from './handMetrics';
import { createHandMachine, type HandMode, type HandOutput } from './handState';

export type GestureStatus = 'off' | 'requesting' | 'running' | 'denied' | 'unavailable' | 'error';

export interface GestureSnapshot {
  status: GestureStatus;
  detail: string;
  /** True when a live globe control target is currently registered. */
  hasTarget: boolean;
  /** True when a hand is currently detected in the camera feed. */
  handSeen: boolean;
  /** Real per-hand detection, keyed by the VISITOR'S left/right. */
  hands: { left: boolean; right: boolean };
  /** Gesture state-machine mode from real measurements. */
  mode: HandMode;
  /** Reticle state (NDC x/y, select progress, real target) for the UI overlay. */
  reticle: { active: boolean; x: number; y: number; progress: number; showName: boolean; targetId: string | null };
  /** Actions applied since the session started (diagnostics, never UI state). */
  counts: { rotate: number; zoom: number; confirm: number };
}

const DETECT_INTERVAL_MS = 42;
const DETACH_GRACE_MS = 700;
/* Auto-rotation resumes this long after the last detected hand. */
const HAND_LOST_GRACE_MS = 1500;
const BASE = import.meta.env.BASE_URL || '/';
/* The reticle mirrors X ONCE here: the raw camera frame is unmirrored but the
   self-view is flipped, so a hand moving to the visitor's right lowers x in the
   landmarks and must map to an increasing NDC x. */
const RETICLE_MIRROR_X = true;

/* The two surfaces that host a driveable globe: the hub (its earth scene) and the /earth route. */
const EARTH_SURFACES = new Set(['/', '/earth']);
function isEarthSurface(): boolean {
  const path = window.location.pathname;
  const rel = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  const normalised = '/' + rel.replace(/^\/+/, '').replace(/\/+$/, '');
  return EARTH_SURFACES.has(normalised);
}



interface Landmark {
  x: number;
  y: number;
  z?: number;
}

interface HandednessCategory {
  categoryName?: string;
  displayName?: string;
  score?: number;
}

/**
 * The HandLandmarker result we actually read. Older builds expose `handedness`,
 * newer ones `handednesses`; BOTH are declared and read defensively so the code
 * works against the installed bundle without guessing.
 */
interface HandResult {
  landmarks: Landmark[][];
  handedness?: HandednessCategory[][];
  handednesses?: HandednessCategory[][];
}

interface HandLandmarkerLike {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => HandResult;
  close?: () => void;
}

/**
 * MediaPipe's handedness label assumes a MIRRORED (selfie) image. Our raw camera
 * frame is NOT mirrored, so a front-camera hand on the visitor's right comes back
 * labelled "Right" but sits on the left of the raw frame. We therefore flip the
 * label to get the VISITOR's own left/right. Documented so it can be re-checked
 * on a real camera; it is not a fixed array-index guess.
 */
const HANDEDNESS_FLIP_FOR_FRONT_CAMERA = false; // reversible calibration experiment: see Stage-3 report

interface HandsFrame {
  /** First detected hand (back-compat with the single-hand path). */
  any: Landmark[] | null;
  left: Landmark[] | null;
  right: Landmark[] | null;
}

/** Map the recogniser's hands to the visitor's left/right by REAL handedness. */
function readHands(result: HandResult | null): HandsFrame {
  const out: HandsFrame = { any: null, left: null, right: null };
  const lm = result?.landmarks ?? [];
  if (lm.length === 0) return out;
  out.any = lm[0] ?? null;
  const labels = result?.handedness ?? result?.handednesses ?? [];
  for (let i = 0; i < lm.length; i++) {
    const label = labels[i]?.[0]?.categoryName ?? labels[i]?.[0]?.displayName ?? '';
    let side: 'left' | 'right' | null = null;
    if (label === 'Left') side = HANDEDNESS_FLIP_FOR_FRONT_CAMERA ? 'right' : 'left';
    else if (label === 'Right') side = HANDEDNESS_FLIP_FOR_FRONT_CAMERA ? 'left' : 'right';
    if (side === 'left' && !out.left) out.left = lm[i];
    else if (side === 'right' && !out.right) out.right = lm[i];
  }
  return out;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks: (path: string) => Promise<unknown> };
  HandLandmarker: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<HandLandmarkerLike>;
  };
}

export interface GestureSession {
  snapshot: () => GestureSnapshot;
  subscribe: (listener: () => void) => () => void;
  attach: () => void;
  detach: () => void;
  setTarget: (ref: MutableRefObject<GlobeControlApi | null>) => void;
  clearTarget: (ref: MutableRefObject<GlobeControlApi | null>) => void;
  getStream: () => MediaStream | null;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function createSession(): GestureSession {
  let status: GestureStatus = 'off';
  let detail = '';
  let stream: MediaStream | null = null;
  let detector: HandLandmarkerLike | null = null;
  let modulePromise: Promise<VisionModule> | null = null;
  let loopId = 0;
  let enableToken = 0;
  let target: MutableRefObject<GlobeControlApi | null> | null = null;
  let attached = false;
  let detachTimer: ReturnType<typeof setTimeout> | null = null;
  let video: HTMLVideoElement | null = null;

  const counts = { rotate: 0, zoom: 0, confirm: 0 };
  const listeners = new Set<() => void>();
  /* The globe fills its control ref asynchronously (after its textures load) and
     has no way to notify a plain module, so a light watcher emits when the target
     appears or disappears — that is what keeps the UI telling the truth. */
  let watchId = 0;
  let lastHasTarget = false;

  /* Per-recognition state — never React state, because this runs at ~24 Hz. */
  let hadHand = false;
  let leftSeen = false;
  let rightSeen = false;
  /* Step 2 data chain: real landmarks -> measurements -> state machine. The
     machine's actions are NOT applied to the globe yet (that is Step 3); the
     resulting mode is exposed so the HUD can report it truthfully. */
  const metrics = createHandMetrics();
  const machine = createHandMachine();
  let lastHandOut: HandOutput | null = null;
  const reticle = { active: false, x: 0, y: 0, progress: 0, showName: false, targetId: null as string | null };
  let lastTickAt = 0;
  /* Auto-rotation is paused while a hand is in frame (see tick). */
  let autoRotatePaused = false;
  let lastHandAt = 0;

  function emit() {
    listeners.forEach((fn) => fn());
  }

  function setStatus(next: GestureStatus, text = '') {
    if (status === next && detail === text) return;
    status = next;
    detail = text;
    emit();
  }

  function snapshot(): GestureSnapshot {
    return { status, detail, hasTarget: !!target?.current, handSeen: hadHand, hands: { left: leftSeen, right: rightSeen }, mode: lastHandOut?.mode ?? 'off', reticle: { active: reticle.active, x: reticle.x, y: reticle.y, progress: reticle.progress, showName: reticle.showName, targetId: reticle.targetId }, counts: { ...counts } };
  }

  function watchTarget() {
    const present = !!target?.current;
    if (present === lastHasTarget) return;
    lastHasTarget = present;
    emit();
  }

  function startWatch() {
    if (!watchId) watchId = window.setInterval(watchTarget, 350);
  }

  function stopWatch() {
    if (watchId) {
      window.clearInterval(watchId);
      watchId = 0;
    }
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    startWatch();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stopWatch();
    };
  }

  async function loadVision(): Promise<VisionModule> {
    if (!modulePromise) {
      const load = async (): Promise<VisionModule> => {
        const url = new URL(BASE + 'vendor/mediapipe/vision_bundle.mjs', window.location.href).href;
        const res = await fetch(url);
        if (!res.ok) throw new Error('vision bundle HTTP ' + res.status);
        const source = await res.text();
        const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          return (await import(/* @vite-ignore */ blobUrl)) as unknown as VisionModule;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      };
      modulePromise = load().catch((err) => {
        modulePromise = null;
        throw err;
      });
    }
    return modulePromise;
  }

  function ensureVideo(): HTMLVideoElement {
    if (video && video.isConnected) return video;
    const v = document.createElement('video');
    v.muted = true;
    v.autoplay = true;
    v.playsInline = true;
    v.tabIndex = -1;
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
    video = v;
    return v;
  }

  /* Drop every per-frame baseline so the next detected hand starts fresh and is
     never compared against a stale position or size. */
  function resetInput() {
    /* Per-frame baselines now live in handMetrics / handState, so there is
       nothing to reset here; kept so the call sites read unchanged. */
  }

  function releaseCamera() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    if (video) {
      try {
        video.pause();
      } catch {
        /* the element may already be detached */
      }
      video.srcObject = null;
      video.remove();
      video = null;
    }
    resetInput();
  }

  function startLoop() {
    if (loopId) return;
    loopId = window.setInterval(tick, DETECT_INTERVAL_MS);
  }

  function stopLoop() {
    if (!loopId) return;
    window.clearInterval(loopId);
    loopId = 0;
  }


  function tick() {
    if (status !== 'running') return;
    const v = video;
    const det = detector;
    if (!v || !det || v.readyState < 2) return;

    const now = performance.now();
    const dt = lastTickAt ? Math.min(0.1, Math.max(0.01, (now - lastTickAt) / 1000)) : 1 / 24;
    lastTickAt = now;

    let result: HandResult | null = null;
    try {
      result = det.detectForVideo(v, now);
    } catch {
      return;
    }

    const api = target?.current;
    const hands = readHands(result);
    leftSeen = !!hands.left;
    rightSeen = !!hands.right;
    const hand = hands.any;

    /* Reticle: map the filtered RIGHT-hand anchor to globe-canvas NDC, then ask the
       globe which REAL region is under it (query only — no panel). One Step per
       tick, so the confirm timing advances exactly once per recognition frame. */
    const sample = metrics.measure({ ready: true, left: hands.left, right: hands.right, targetId: null });
    if (api && sample.right) {
      const ndcX = RETICLE_MIRROR_X ? 1 - 2 * sample.rightX : 2 * sample.rightX - 1;
      const ndcY = 1 - 2 * sample.rightY;
      reticle.x = ndcX;
      reticle.y = ndcY;
      sample.targetId = api.queryAtScreen(ndcX, ndcY);
    } else {
      sample.targetId = null;
    }
    lastHandOut = machine.step(sample, dt * 1000);
    reticle.active = lastHandOut.mode === 'select';
    reticle.showName = lastHandOut.mode === 'select' && lastHandOut.showName;
    reticle.progress = lastHandOut.mode === 'select' ? lastHandOut.selectProgress : 0;
    reticle.targetId = lastHandOut.mode === 'select' ? sample.targetId : null;
    if (api && lastHandOut.confirmId) {
      /* Confirm the region the reticle is actually over (query id == confirm id). */
      api.selectAtScreen(reticle.x, reticle.y);
    }

    /* The gesture STATE MACHINE drives the globe (Step 3):
       rotateDeg — horizontal rotation delta (deg), with the machine's own inertia;
       zoomFactor — camera-distance multiplier (already 1 during select/reset, so
       all zoom is frozen there); reset — one-shot. */
    /* Guard on the live control API so TypeScript narrows it. */
    if (api && lastHandOut) {
      /* Left-hand rotation direction is inverted HERE, in the single adapter layer
         between the state machine and the Three.js API (the machine's own units and
         magnitude are unchanged; only the sign flips). */
      if (lastHandOut.rotateDeg) api.rotateBy(-lastHandOut.rotateDeg);
      if (lastHandOut.zoomFactor !== 1) api.zoomBy(lastHandOut.zoomFactor);
      if (lastHandOut.reset) api.reset();
    }

    if (!hand) {
      if (hadHand) {
        hadHand = false;
        resetInput();
        setStatus('running', '');
      }
      /* The globe keeps the last spin velocity and glides on its own (EarthGlobe
         applies the decay); once it decays, auto-rotation resumes. We only need
         to allow auto-rotation back on after the hand has been gone a moment. */
      if (autoRotatePaused && api && now - lastHandAt > HAND_LOST_GRACE_MS) {
        api.setAutoRotate(true);
        autoRotatePaused = false;
      }
      return;
    }

    if (!hadHand) {
      hadHand = true;
      resetInput();
      setStatus('running', '已识别到手：左右移动旋转（松手有惯性），靠近放大，远离缩小，捏合确认。');
    }
    if (!api) return;

    lastHandAt = now;
    if (!autoRotatePaused) {
      /* A hand is in frame, so the only motion should be the visitor's. */
      api.setAutoRotate(false);
      autoRotatePaused = true;
    }
  }

  async function enable() {
    if (status === 'running' || status === 'requesting') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable', '此浏览器不支持摄像头采集；鼠标、触摸与键盘仍可操作。');
      return;
    }
    const token = ++enableToken;
    setStatus('requesting', '正在请求摄像头…');
    try {
      /* Full-frame capture: resizeMode 'none' asks the browser not to crop or
         scale the frame (ignored where unsupported). The whole frame feeds the
         detector; nothing here follows a face. */
      const videoConstraints: MediaTrackConstraints = {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      };
      (videoConstraints as MediaTrackConstraints & { resizeMode?: string }).resizeMode = 'none';
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
      if (token !== enableToken) {
        for (const t of acquired.getTracks()) t.stop();
        return;
      }
      stream = acquired;
      const v = ensureVideo();
      v.srcObject = acquired;
      try {
        await v.play();
      } catch {
        /* frames still arrive once the element is allowed to play */
      }

      if (!detector) {
        let mod: VisionModule;
        try {
          mod = await loadVision();
        } catch {
          if (token === enableToken) {
            releaseCamera();
            setStatus('unavailable', '手势识别资源加载失败（本地模型或 WASM 不可用）。');
          }
          return;
        }
        if (token !== enableToken) return;
        try {
          const fileset = await mod.FilesetResolver.forVisionTasks(BASE + 'vendor/mediapipe/wasm');
          const options = (delegate: string) => ({
            baseOptions: { modelAssetPath: BASE + 'models/hand_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numHands: 2,
          });
          try {
            detector = await mod.HandLandmarker.createFromOptions(fileset, options('GPU'));
          } catch {
            detector = await mod.HandLandmarker.createFromOptions(fileset, options('CPU'));
          }
        } catch (err) {
          if (token === enableToken) {
            releaseCamera();
            setStatus('unavailable', '手势识别器初始化失败：' + messageOf(err));
          }
          return;
        }
      }

      if (token !== enableToken) return;
      setStatus('running', '');
      startLoop();
    } catch (err) {
      if (token !== enableToken) return;
      const name = err instanceof Error ? err.name : '';
      releaseCamera();
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied', '摄像头权限被拒绝；鼠标、触摸与键盘仍可操作。');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setStatus('unavailable', '未找到可用的摄像头设备。');
      } else {
        setStatus('error', '手势启动失败：' + messageOf(err));
      }
    }
  }

  function disable() {
    if (detachTimer) {
      clearTimeout(detachTimer);
      detachTimer = null;
    }
    enableToken++;
    stopLoop();
    if (detector) {
      try {
        detector.close?.();
      } catch {
        /* detector already gone */
      }
      detector = null;
    }
    /* Hand the globe back to its own idle rotation. */
    if (autoRotatePaused) {
      try {
        target?.current?.setAutoRotate(true);
      } catch {
        /* target already gone */
      }
      autoRotatePaused = false;
    }
    releaseCamera();
    setStatus('off', '');
  }

  function toggle() {
    if (status === 'running' || status === 'requesting') disable();
    else void enable();
  }

  function attach() {
    attached = true;
    if (detachTimer) {
      clearTimeout(detachTimer);
      detachTimer = null;
    }
  }

  function detach() {
    attached = false;
    if (detachTimer) clearTimeout(detachTimer);
    detachTimer = setTimeout(settle, DETACH_GRACE_MS);
  }

  /*
   * A detach is not proof the earth experience is over: the hub hosts the globe in
   * a scroll scene, and /earth is a lazily-loaded route, so the arriving globe can
   * mount long after the grace window. settle() therefore keeps the session while
   * the address bar still points at an earth surface and disables only once the
   * visitor is genuinely elsewhere.
   */
  function settle() {
    detachTimer = null;
    if (attached) return;
    if (isEarthSurface()) {
      detachTimer = setTimeout(settle, DETACH_GRACE_MS);
      return;
    }
    disable();
  }

  function setTarget(ref: MutableRefObject<GlobeControlApi | null>) {
    target = ref;
    lastHasTarget = !!ref.current;
    /* The arriving globe owns its own auto-rotate flag; drop any stale pause so
       nothing is left stuck if the hand has gone in the meantime. */
    autoRotatePaused = false;
    emit();
  }

  function clearTarget(ref: MutableRefObject<GlobeControlApi | null>) {
    if (target === ref) {
      if (autoRotatePaused) {
        try {
          ref.current?.setAutoRotate(true);
        } catch {
          /* target already gone */
        }
        autoRotatePaused = false;
      }
      target = null;
      lastHasTarget = false;
      emit();
    }
  }

  const session: GestureSession = {
    snapshot,
    subscribe,
    attach,
    detach,
    setTarget,
    clearTarget,
    getStream: () => stream,
    enable: () => void enable(),
    disable,
    toggle,
  };

  /* Read-only diagnostic handle for the browser-verification scripts. */
  (window as unknown as { __tvGesture?: { snapshot: () => GestureSnapshot } }).__tvGesture = {
    snapshot,
  };

  return session;
}

interface SessionGlobal {
  __tvGestureSession?: GestureSession;
}

const globalRef = globalThis as unknown as SessionGlobal;
export const gestureSession: GestureSession =
  globalRef.__tvGestureSession ?? (globalRef.__tvGestureSession = createSession());