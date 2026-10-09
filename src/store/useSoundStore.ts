/**
 * useSoundStore — audio preferences, mirrored from the sound engine.
 *
 * Both controls are independent, both default to OFF, and nothing is ever
 * played before the visitor acts. The store holds the persisted preference; the
 * engine in src/lib/sound.ts holds the Web Audio graph. They are connected here
 * so components never touch the engine directly.
 */

import { create } from 'zustand';
import { sound } from '@/lib/sound';
import { readFlag, storageKeys, writeFlag } from '@/lib/storage';

export interface SoundStoreState {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  /** False when no audio graph is available (unsupported browser). */
  sfxSupported: boolean;
  /** False when /assets/audio/ambient.m4a is absent — the shipped default. */
  musicAvailable: boolean;
  /** True once the availability probe has run. */
  probed: boolean;

  toggleMusic: () => Promise<void>;
  toggleSfx: () => Promise<void>;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  probe: () => Promise<void>;
}

export const useSoundStore = create<SoundStoreState>((set, get) => ({
  // Default MUTED, always. Persisted only after an explicit choice.
  musicEnabled: readFlag(storageKeys.sound + '.music', false),
  sfxEnabled: readFlag(storageKeys.sound + '.sfx', false),
  musicVolume: 0.32,
  sfxVolume: 0.5,
  sfxSupported: typeof window !== 'undefined' && Boolean(window.AudioContext),
  musicAvailable: true,
  probed: false,

  toggleMusic: async () => {
    const next = !get().musicEnabled;
    set({ musicEnabled: next });
    writeFlag(storageKeys.sound + '.music', next);
    await sound.setMusicEnabled(next);
    const state = sound.getState();
    set({ musicAvailable: state.musicAvailable, probed: true });
  },

  toggleSfx: async () => {
    const next = !get().sfxEnabled;
    set({ sfxEnabled: next });
    writeFlag(storageKeys.sound + '.sfx', next);
    await sound.setSfxEnabled(next);
  },

  setMusicVolume: (v) => {
    set({ musicVolume: v });
    sound.setMusicVolume(v);
  },

  setSfxVolume: (v) => {
    set({ sfxVolume: v });
    sound.setSfxVolume(v);
  },

  probe: async () => {
    if (get().probed) return;
    const available = await sound.probeMusic();
    set({ musicAvailable: available, probed: true });
  },
}));

/** Fire-and-forget interface sound. Safe to call anywhere; a no-op when off. */
export function playSfx(key: Parameters<typeof sound.play>[0]): void {
  sound.play(key);
}
