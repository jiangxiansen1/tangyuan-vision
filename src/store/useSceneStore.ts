/**
 * useSceneStore — spatial navigation state.
 *
 * The home hub is a field of windows rather than a nav bar, so "which window is
 * focused" is real application state and has to survive keyboard traversal and
 * route changes. That is all this holds.
 */

import { create } from 'zustand';

export interface SceneStoreState {
  /** Index of the keyboard-focused window on the hub. -1 = none yet. */
  focusIndex: number;
  /** Total windows currently rendered, set by the hub so clamping is correct. */
  windowCount: number;
  /** Set while a window is being opened, so the hub can suppress re-entry. */
  transitioning: boolean;

  setFocusIndex: (i: number) => void;
  moveFocus: (delta: number, columns: number) => void;
  setWindowCount: (n: number) => void;
  setTransitioning: (v: boolean) => void;
  reset: () => void;
}

export const useSceneStore = create<SceneStoreState>((set, get) => ({
  focusIndex: -1,
  windowCount: 0,
  transitioning: false,

  setFocusIndex: (focusIndex) => set({ focusIndex }),

  /**
   * Move focus by ±1 (left/right) or ±columns (up/down), wrapping at the ends.
   * Wrapping is intentional: the hub is a ring of windows, not a list, so Tab
   * order and arrow order should both be continuous.
   */
  moveFocus: (delta, columns) => {
    const { focusIndex, windowCount } = get();
    if (windowCount === 0) return;
    const step = delta < 0 ? -1 : 1;
    const amount = Math.abs(delta) > 1 ? columns * step : step;
    let next = (focusIndex < 0 ? (step > 0 ? -1 : 0) : focusIndex) + amount;
    next = ((next % windowCount) + windowCount) % windowCount;
    set({ focusIndex: next });
  },

  setWindowCount: (windowCount) => set({ windowCount }),
  setTransitioning: (transitioning) => set({ transitioning }),
  reset: () => set({ focusIndex: -1, transitioning: false }),
}));
