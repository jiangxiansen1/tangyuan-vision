/**
 * storage.ts — safe, namespaced localStorage.
 *
 * Private-mode Safari and hardened browsers throw on write rather than failing
 * quietly, and this app stores the visitor's own preferences (motion, sound,
 * glass quality, whether they have seen the boot sequence). A storage failure
 * must never break the site, so every access is guarded and degrades to an
 * in-memory shim.
 */

const NS = 'tv:';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const memory = new Map<string, string>();

let persistent = true;

function probe(): boolean {
  try {
    const k = `${NS}__probe`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  persistent = probe();
}

export const storageIsPersistent = persistent;

export function readRaw(key: string): string | null {
  try {
    return persistent ? window.localStorage.getItem(NS + key) : (memory.get(NS + key) ?? null);
  } catch {
    return memory.get(NS + key) ?? null;
  }
}

export function writeRaw(key: string, value: string): void {
  memory.set(NS + key, value);
  if (!persistent) return;
  try {
    window.localStorage.setItem(NS + key, value);
  } catch {
    /* quota or private mode — the in-memory copy still serves this session */
  }
}

export function removeRaw(key: string): void {
  memory.delete(NS + key);
  try {
    window.localStorage.removeItem(NS + key);
  } catch {
    /* ignore */
  }
}

/** Read a JSON value, falling back when absent or corrupt. */
export function readJson<T extends Json>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: Json): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Read a boolean flag. */
export function readFlag(key: string, fallback = false): boolean {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function writeFlag(key: string, value: boolean): void {
  writeRaw(key, value ? 'true' : 'false');
}

export const storageKeys = {
  bootSeen: 'boot.seen',
  motion: 'pref.motion',
  sound: 'pref.sound',
  glass: 'pref.glass',
  contrast: 'pref.contrast',
  lastScene: 'nav.lastScene',
  secretUnlocked: 'secret.unlocked',
} as const;
