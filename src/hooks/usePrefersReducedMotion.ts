/**
 * usePrefersReducedMotion — the single source of truth for motion preference.
 *
 * Resolution order:
 *   1. an explicit in-app override stored by the visitor ('on' | 'off')
 *   2. the OS-level `prefers-reduced-motion` media query
 *
 * The in-app override exists because a visitor may want to reduce motion on this
 * site specifically without changing a system-wide setting. It is stored, so it
 * survives a reload, and it is settable from the settings panel.
 */

import { useCallback, useEffect, useState } from 'react';
import { readRaw, storageKeys, writeRaw } from '@/lib/storage';

export type MotionPref = 'system' | 'on' | 'off';

function readOverride(): MotionPref {
  const raw = readRaw(storageKeys.motion);
  return raw === 'on' || raw === 'off' ? raw : 'system';
}

function systemReduces(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion(): {
  reduced: boolean;
  pref: MotionPref;
  setPref: (next: MotionPref) => void;
} {
  const [pref, setPrefState] = useState<MotionPref>(() => readOverride());
  const [system, setSystem] = useState<boolean>(() => systemReduces());

  // Track the OS setting live — the visitor may toggle it while the tab is open.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setPref = useCallback((next: MotionPref) => {
    setPrefState(next);
    if (next === 'system') writeRaw(storageKeys.motion, 'system');
    else writeRaw(storageKeys.motion, next);
  }, []);

  const reduced = pref === 'system' ? system : pref === 'on';

  return { reduced, pref, setPref };
}
