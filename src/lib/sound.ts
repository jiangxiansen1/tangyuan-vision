/**
 * sound.ts — the audio system.
 *
 * Design constraints this module had to satisfy:
 *   • Background music and interface effects are independently controllable.
 *   • Default is MUTED. Nothing may play before the visitor acts.
 *   • No paid API, no third-party streaming, no unlicensed media.
 *   • If an audio file is missing, everything else keeps working.
 *
 * Consequences:
 *   Background music is a real, licensed-by-omission asset slot: we look for an
 *   optional file and silently do nothing when it is absent (the shipped default
 *   — see docs/CONTENT.md). Interface effects are SYNTHESISED with the Web Audio
 *   API rather than shipped as files. That is a deliberate choice: it means the
 *   effects have no licensing surface at all, cost zero bytes of download, and
 *   are generated only when actually enabled.
 */

import { assetUrl } from './asset';

export type SoundKey = 'navigate' | 'open' | 'close' | 'select' | 'toggle' | 'deny' | 'unlock';

/** SFX recipes. Short, quiet, and in the brand's register: glass, not arcade. */
interface SfxRecipe {
  /** Oscillator types, layered. */
  voices: Array<{
    type: OscillatorType;
    /** start frequency (Hz) */
    from: number;
    /** target frequency (Hz) */
    to: number;
    /** relative gain */
    gain: number;
    /** seconds */
    duration: number;
  }>;
  /** optional filtered noise burst, 0..1 */
  noise: number;
  /** overall gain multiplier */
  level: number;
}

const RECIPES: Record<SoundKey, SfxRecipe> = {
  // A soft upward glass tap.
  navigate: { voices: [{ type: 'sine', from: 880, to: 1320, gain: 1, duration: 0.1 }], noise: 0.05, level: 0.5 },
  // The window-opening "inhale".
  open: {
    voices: [
      { type: 'sine', from: 240, to: 620, gain: 0.8, duration: 0.26 },
      { type: 'triangle', from: 480, to: 1240, gain: 0.3, duration: 0.2 },
    ],
    noise: 0.12,
    level: 0.55,
  },
  // The window-closing "exhale" — same shape, inverted.
  close: {
    voices: [
      { type: 'sine', from: 620, to: 200, gain: 0.7, duration: 0.22 },
      { type: 'triangle', from: 1240, to: 420, gain: 0.24, duration: 0.16 },
    ],
    noise: 0.1,
    level: 0.5,
  },
  // A crisp tick for selection.
  select: { voices: [{ type: 'square', from: 1760, to: 1760, gain: 0.28, duration: 0.028 }], noise: 0.02, level: 0.4 },
  // Two-state toggle.
  toggle: {
    voices: [
      { type: 'sine', from: 660, gain: 0.7, to: 660, duration: 0.05 },
      { type: 'sine', from: 990, gain: 0.5, to: 990, duration: 0.05 },
    ],
    noise: 0,
    level: 0.45,
  },
  // Refusal — deliberately dull and low, never harsh.
  deny: { voices: [{ type: 'sine', from: 220, to: 150, gain: 0.8, duration: 0.18 }], noise: 0.04, level: 0.5 },
  // The hidden space: a small, resolving interval. The one "reward" sound.
  unlock: {
    voices: [
      { type: 'sine', from: 392, to: 392, gain: 0.6, duration: 0.4 },
      { type: 'sine', from: 587, to: 587, gain: 0.45, duration: 0.5 },
      { type: 'sine', from: 880, to: 1174, gain: 0.3, duration: 0.7 },
    ],
    noise: 0.06,
    level: 0.5,
  },
};

export interface SoundState {
  /** Whether an audio file was found for the ambient bed. */
  musicAvailable: boolean;
  /** True once the context exists and is running. */
  running: boolean;
  /** Mirrored so subscribers see engine-side corrections, e.g. a failed play(). */
  musicEnabled?: boolean;
  sfxEnabled?: boolean;
}

/**
 * Candidate paths for the ambient bed, tried in order. The compressed format
 * comes first; the uncompressed WAV that the build script emits is the fallback
 * so a fresh clone works with no extra conversion step.
 */
const MUSIC_CANDIDATES = ['/assets/audio/ambient.m4a', '/assets/audio/ambient.wav'] as const;

/**
 * Probe one URL without downloading it.
 *
 * HEAD is used first because it costs no body bytes. Some static servers and dev
 * servers reject HEAD with 405, so a 1-byte ranged GET is the second attempt.
 * Either way the response tells us whether the file exists.
 */
async function probeUrl(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return true;
    if (head.status === 404 || head.status === 403) return false;
  } catch {
    // Network error: fall through to the GET probe rather than concluding the
    // file is missing, since a CORS or HEAD restriction is not absence.
  }
  try {
    const get = await fetch(url, { headers: { Range: 'bytes=0-1' } });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicEnabled = false;
  private sfxEnabled = false;
  private musicVolume = 0.32;
  private sfxVolume = 0.5;

  /** Set false permanently when no ambient file is found. */
  private musicAvailable = true;
  private musicProbed = false;
  /** The path that actually resolved, set by probeMusic(). */
  private musicUrl: string | null = null;
  /** Set true if the Web Audio API is unavailable in this browser. */
  private sfxUnavailable = false;

  private listeners = new Set<(patch: Partial<SoundState> & { musicAvailable?: boolean }) => void>();

  // ------------------------------------------------------------- lifecycle

  /** Lazily create the AudioContext. Never called before a user gesture. */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.sfxUnavailable = true;
      return null;
    }
    try {
      this.ctx = new Ctor();
    } catch {
      this.sfxUnavailable = true;
      return null;
    }
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
    this.sfxGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicEnabled ? this.musicVolume : 0;
    this.musicGain.connect(this.ctx.destination);

    // A short noise buffer, reused by every recipe that asks for noise.
    const len = Math.floor(this.ctx.sampleRate * 0.3);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.6;
    this.noiseBuffer = buf;

    return this.ctx;
  }

  /** Browsers suspend the context until a gesture; resume on demand. */
  private async resume(): Promise<void> {
    try {
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  private emit(patch: Partial<SoundState> & { musicAvailable?: boolean }): void {
    this.listeners.forEach((fn) => fn(patch));
  }

  subscribe(fn: (patch: Partial<SoundState> & { musicAvailable?: boolean }) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ------------------------------------------------------------ interface

  getState(): SoundState & {
    musicEnabled: boolean;
    sfxEnabled: boolean;
    musicVolume: number;
    sfxVolume: number;
    sfxUnavailable: boolean;
  } {
    return {
      musicEnabled: this.musicEnabled,
      sfxEnabled: this.sfxEnabled,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      musicAvailable: this.musicAvailable,
      running: this.ctx?.state === 'running',
      sfxUnavailable: this.sfxUnavailable,
    };
  }

  /**
   * Probe for the optional ambient bed. Called on the first user gesture rather
   * than at load, because a visitor who never enables sound should not pay for a
   * request at all.
   *
   * Two candidate paths are tried in order: the compressed `.m4a` first, then the
   * uncompressed `.wav` that tools/build-audio.cjs emits. Whichever resolves is
   * remembered, so this probe runs at most twice per session and the winning
   * path is what actually plays.
   */
  async probeMusic(): Promise<boolean> {
    if (this.musicProbed) return this.musicAvailable;
    this.musicProbed = true;

    for (const candidate of MUSIC_CANDIDATES) {
      const url = assetUrl(candidate);
      if (await probeUrl(url)) {
        this.musicUrl = url;
        this.musicAvailable = true;
        this.emit({ musicAvailable: true });
        return true;
      }
    }

    this.musicAvailable = false;
    this.emit({ musicAvailable: false });
    return false;
  }

  async setMusicEnabled(on: boolean): Promise<void> {
    this.musicEnabled = on;
    if (!on) {
      this.fadeMusic(0);
      if (this.musicEl) this.musicEl.pause();
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    await this.resume();

    const available = await this.probeMusic();
    if (!available) {
      // Honest degradation: report it, keep the toggle in its new state so the
      // preference persists for when the file is added.
      this.emit({ musicAvailable: false });
      return;
    }

    if (!this.musicEl) {
      const el = new Audio();
      el.src = this.musicUrl ?? assetUrl(MUSIC_CANDIDATES[0]);
      el.loop = true;
      el.preload = 'none';
      el.crossOrigin = 'anonymous';
      el.addEventListener('error', () => {
        this.musicAvailable = false;
        this.musicEnabled = false;
        this.emit({ musicAvailable: false, musicEnabled: false });
      });
      this.musicEl = el;
      try {
        this.musicSource = ctx.createMediaElementSource(el);
        this.musicSource.connect(this.musicGain!);
      } catch {
        // Some browsers refuse MediaElementSource on a cross-origin element;
        // in that case drive the element's own volume directly.
        this.musicSource = null;
      }
    }

    try {
      await this.musicEl.play();
      this.fadeMusic(this.musicVolume);
    } catch {
      this.musicEnabled = false;
      this.emit({ musicEnabled: false });
    }
  }

  private fadeMusic(target: number, seconds = 0.8): void {
    if (this.musicGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(target, now + seconds);
    } else if (this.musicEl) {
      this.musicEl.volume = target;
    }
  }

  async setSfxEnabled(on: boolean): Promise<void> {
    this.sfxEnabled = on;
    if (!on) {
      if (this.sfxGain && this.ctx) {
        this.sfxGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      }
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    await this.resume();
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(this.sfxVolume, ctx.currentTime, 0.02);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    if (this.musicEnabled) this.fadeMusic(this.musicVolume, 0.15);
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    if (this.sfxEnabled && this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.02);
    }
  }

  /** Play an interface effect. A no-op unless effects are enabled. */
  play(key: SoundKey): void {
    if (!this.sfxEnabled || this.sfxUnavailable) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void this.resume();

    const recipe = RECIPES[key];
    const t0 = ctx.currentTime;
    const peak = recipe.level * this.sfxVolume;

    recipe.voices.forEach((v) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(Math.max(1, v.from), t0);
      if (v.to !== v.from) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.to), t0 + v.duration);
      }
      // Fast attack, exponential decay — the "glass" envelope.
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * v.gain), t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.duration);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(t0);
      osc.stop(t0 + v.duration + 0.02);
    });

    if (recipe.noise > 0 && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak * recipe.noise, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      src.start(t0);
      src.stop(t0 + 0.16);
    }
  }

  /** Suspend everything when the tab is hidden — no background audio. */
  handleVisibility(hidden: boolean): void {
    if (hidden) {
      if (this.musicEl && this.musicEnabled) this.musicEl.pause();
      if (this.ctx?.state === 'running') void this.ctx.suspend();
    } else if (this.musicEnabled && this.musicEl) {
      void this.resume().then(() => this.musicEl?.play().catch(() => undefined));
    } else {
      void this.resume();
    }
  }

  /** Full teardown, used on unmount in development/HMR. */
  dispose(): void {
    try {
      this.musicEl?.pause();
      if (this.musicEl) this.musicEl.src = '';
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.musicEl = null;
    this.musicSource = null;
    this.musicGain = null;
    this.sfxGain = null;
  }
}

export const sound = new SoundEngine();
