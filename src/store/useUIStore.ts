/**
 * useUIStore — transient interface state.
 *
 * Kept deliberately small and separate from content. Anything that persists
 * across a reload goes through src/lib/storage.ts so the "does this survive a
 * refresh?" question has exactly one answer per field.
 */

import { create } from 'zustand';
import { readFlag, storageKeys, writeFlag } from '@/lib/storage';

export interface UIState {
  /** The boot sequence has finished (or been skipped) for this visit. */
  booted: boolean;
  /** True while the boot overlay is on screen. */
  bootVisible: boolean;
  /** Settings panel visibility. */
  settingsOpen: boolean;
  /** Command / scene switcher visibility, for keyboard-driven navigation. */
  switcherOpen: boolean;
  /** True once the visitor has interacted, which is what unlocks audio. */
  interacted: boolean;
  /** Whether the visitor has ever completed the hidden-space entry. */
  secretUnlocked: boolean;
  /** Set when a toast should be shown. */
  toast: { id: number; message: string; tone: 'info' | 'warn' | 'ok' } | null;

  finishBoot: () => void;
  setBootVisible: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setSwitcherOpen: (v: boolean) => void;
  markInteracted: () => void;
  markSecretUnlocked: () => void;
  pushToast: (message: string, tone?: 'info' | 'warn' | 'ok') => void;
  clearToast: () => void;
}

let toastSeq = 0;

export const useUIStore = create<UIState>((set) => ({
  // The boot overlay renders immediately; AppGate decides whether to skip it.
  booted: false,
  bootVisible: false,
  settingsOpen: false,
  switcherOpen: false,
  interacted: false,
  secretUnlocked: readFlag(storageKeys.secretUnlocked, false),
  toast: null,

  finishBoot: () => {
    writeFlag(storageKeys.bootSeen, true);
    set({ booted: true, bootVisible: false });
  },
  setBootVisible: (bootVisible) => set({ bootVisible }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSwitcherOpen: (switcherOpen) => set({ switcherOpen }),
  markInteracted: () => set((s) => (s.interacted ? s : { interacted: true })),
  markSecretUnlocked: () => {
    writeFlag(storageKeys.secretUnlocked, true);
    set({ secretUnlocked: true });
  },
  pushToast: (message, tone = 'info') => set({ toast: { id: ++toastSeq, message, tone } }),
  clearToast: () => set({ toast: null }),
}));
