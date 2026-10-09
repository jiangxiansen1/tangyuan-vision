/**
 * interactions/visitor.ts — the anonymous deduplication token.
 *
 * WHAT THIS IS
 * A per-browser random value, salted and hashed, used as *one* of the components
 * of the UNIQUE(photo_id, visitor_hash) constraint that lives in
 * supabase/migrations/20261009120001_interactions_schema.sql.
 *
 * WHAT THIS IS NOT — read this before writing any UI text about it
 *   • It is not an identity. Nobody is authenticated; there is no account and no
 *     session. The server cannot tell two browsers apart for any reason other
 *     than "they sent different strings".
 *   • It is not a fingerprint. We deliberately do NOT hash the user agent,
 *     screen size, time zone, canvas output or anything else that persists
 *     across a different browser on the same machine — that would be
 *     fingerprinting a visitor, which is a different and much worse thing than
 *     counting a click, and it is unnecessary here.
 *   • It is not hidden. The hash is sent in a request body and in a request
 *     header, so anyone with devtools can read it, and anyone can send a
 *     different one. It is a speed bump for accidental double-counting and for
 *     naive scripted floods. It is NOT a defence against a determined person,
 *     and nothing in this project claims otherwise.
 *   • Clearing site data, using a private window, or switching browser/profile
 *     produces a brand-new token, which the backend accepts as a new visitor.
 *     That is a documented, accepted limitation (docs and supabase/README.md §6).
 *
 * WHY HASH AT ALL, IF IT IS NOT A SECRET
 * Two reasons, both small and both real:
 *   1. The raw local value is never transmitted, so the value stored in the
 *      database can never be replayed against a *different* deployment that
 *      used the same algorithm without the same salt. VITE_VISITOR_SALT exists
 *      for exactly this.
 *   2. It makes the stored row useless as a cross-site identifier: the same
 *      browser visiting two sites that both count likes produces two unrelated
 *      strings.
 * Neither reason justifies calling it anonymisation. It is a pseudonym with a
 * very short lifetime, and the docs say so.
 *
 * WHY THE DIGEST IS TRUNCATED TO 32 HEX CHARS (128 bits)
 * The only property needed is "two random UUIDs do not collide", and we only
 * need it to hold within one site's data. 128 bits is ~10^38, far beyond any
 * collision risk at this scale, and it keeps the stored string short (the DB
 * CHECK accepts 16..64 hex chars, so widening it later needs no migration).
 * It is NOT used for authentication, so the usual argument for a full 256-bit
 * digest does not apply.
 */

import { readRaw, writeRaw } from '@/lib/storage';
import type { OperationFailure, OperationResult } from './types';

/** localStorage key (the storage wrapper adds its own `tv:` namespace). */
const VISITOR_ID_KEY = 'interactions.visitorId';

/**
 * Fallback salt, used only when VITE_VISITOR_SALT is empty.
 *
 * It is a constant, and it is in the bundle, so it adds nothing an attacker
 * could not compute. Its job is to make the *algorithm* version-specific:
 * changing the salt invalidates every previously-derived hash, which is what
 * you want when moving between Supabase projects. Replacing it with a
 * deployment-specific string is a one-line .env change.
 */
const FALLBACK_SALT = 'tangyuan-vision/v1';

/** The salt actually in use, read once at module load. */
const SALT = (import.meta.env.VITE_VISITOR_SALT as string | undefined)?.trim() || FALLBACK_SALT;

/* ------------------------------------------------------------------ id ---- */

function newRandomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* Some hardened contexts expose crypto but throw on use. Fall through. */
  }
  // Last resort. This is NOT a cryptographic source, and it does not need to be:
  // the token's only job is to make an accidental repeat (a double click, a
  // refresh mid-request) land on the same string instead of a new one. If two
  // visitors collide, the worse outcome is that one of them is told they have
  // already liked a photo — which the UNIQUE constraint will make true for
  // whichever of them got there first. Nothing is lost or leaked.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The visitor's local id. Created on first use and kept in localStorage.
 *
 * Kept OUT of any React state on purpose: this has to be identical for every
 * request of a session, and re-deriving it must never depend on a render
 * having happened. The storage wrapper degrades to an in-memory map when
 * localStorage is unavailable (private mode), which is the right behaviour:
 * the token then lives for the page's lifetime and deduplication becomes
 * best-effort within that tab only.
 */
export function getVisitorId(): string {
  const existing = readRaw(VISITOR_ID_KEY);
  if (existing) return existing;
  const created = newRandomId();
  writeRaw(VISITOR_ID_KEY, created);
  return created;
}

/* ---------------------------------------------------------------- hash ---- */

/**
 * Cache: the digest of a given raw id never changes (same id, same salt), and
 * this function is called before every write.
 */
let cachedId: string | null = null;
let cachedHash: string | null = null;

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The hash we would send, or null when this browser cannot compute one. */
export function peekVisitorHash(): string | null {
  return cachedHash;
}

/** True when this browser can sign requests at all (WebCrypto in a secure context). */
export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

/**
 * Derive the value sent to the database as `visitor_hash`.
 *
 * MUST be async: WebCrypto's digest is promise-based, and the previous
 * synchronous implementation of a hash like this is the classic mistake —
 * a hand-rolled JS hash would be both weaker and slower, and would tempt a
 * future maintainer into thinking it was a security primitive.
 *
 * Returns a Result rather than throwing, so callers can keep their own
 * "never fake a success" contract without a try/catch at every call site.
 *
 * Why the input is `${SALT}:${id}` rather than `${id}:${SALT}` — no reason,
 * and that is fine: what matters is that the salt is inside the digest, and
 * that a change of salt changes every output. The separator prevents the
 * concatenation from being ambiguous if either part ever grows a separator.
 */
export async function deriveVisitorHash(): Promise<OperationResult<string>> {
  const id = getVisitorId();

  if (cachedId === id && cachedHash !== null) {
    return { ok: true, data: cachedHash };
  }

  if (!cryptoAvailable()) {
    // `crypto.subtle` is undefined on any origin that is not a secure context,
    // and on browsers older than 2022. GitHub Pages is HTTPS, so this only
    // happens on a plain-HTTP dev origin (e.g. http://192.168.x.x:5183) or a
    // very old browser. Caught here rather than by a runtime TypeError inside
    // fetch, because the honest answer is "your browser cannot sign a request",
    // not "the network failed".
    const failure: OperationFailure = {
      ok: false,
      code: 'unconfigured',
      error: '当前浏览器环境不支持 WebCrypto（需要 HTTPS 页面），无法生成访客去重令牌。',
    };
    return failure;
  }

  try {
    const bytes = new TextEncoder().encode(`${SALT}:${id}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = toHex(digest).slice(0, 32);
    cachedId = id;
    cachedHash = hash;
    return { ok: true, data: hash };
  } catch {
    return {
      ok: false,
      code: 'unconfigured',
      error: '生成访客去重令牌失败。',
    };
  }
}

/**
 * Forget the cached digest. Exported for two callers: a test that wants to
 * exercise a cold cache, and a "reset my local state" button if one is ever
 * added. It does NOT clear the stored id — that is the visitor's own data and
 * is only removed by clearing site data.
 */
export function clearVisitorHashCache(): void {
  cachedId = null;
  cachedHash = null;
}
