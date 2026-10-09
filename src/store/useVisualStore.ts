/**
 * useVisualStore — motion and glass quality preferences.
 *
 * These three settings exist because the same visual design has to run on a
 * high-end desktop and a mid-range phone. Rather than silently guessing, the
 * visitor can see the current level and change it. Two of the three are stored;
 * the motion preference is owned by usePrefersReducedMotion and mirrored into
 * the document so CSS can react to it without a React re-render.
 */

import { create } from 'zustand';
import { readRaw, storageKeys, writeRaw } from '@/lib/storage';

export type GlassQuality = 'high' | 'balanced' | 'off';
export type ContrastMode = 'normal' | 'high';

export interface VisualState {
  glassQuality: GlassQuality;
  contrast: ContrastMode;
  setGlassQuality: (q: GlassQuality) => void;
  setContrast: (c: ContrastMode) => void;
}

function readGlass(): GlassQuality {
  const raw = readRaw(storageKeys.glass);
  return raw === 'high' || raw === 'balanced' || raw === 'off' ? raw : 'high';
}

function readContrast(): ContrastMode {
  const raw = readRaw(storageKeys.contrast);
  return raw === 'high' ? 'high' : 'normal';
}

/** Reflect the current settings onto <html> so CSS can respond declaratively. */
export function applyVisualAttributes(glass: GlassQuality, contrast: ContrastMode): void {
  const root = document.documentElement;
  // 'high' quality keeps the refractive tier enabled; 'balanced' disables the
  // SVG filter but keeps blur; 'off' removes translucency entirely.
  root.dataset.glass = glass;
  root.dataset.contrast = contrast;

  if (glass === 'balanced' || glass === 'off') {
    root.dataset.transparency = 'reduced';
  } else {
    delete root.dataset.transparency;
  }
}

export const useVisualStore = create<VisualState>((set, get) => ({
  glassQuality: readGlass(),
  contrast: readContrast(),

  setGlassQuality: (q) => {
    writeRaw(storageKeys.glass, q);
    set({ glassQuality: q });
    applyVisualAttributes(q, get().contrast);
    window.dispatchEvent(new Event('tv:pref-changed'));
  },

  setContrast: (c) => {
    writeRaw(storageKeys.contrast, c);
    set({ contrast: c });
    applyVisualAttributes(get().glassQuality, c);
  },
}));
