/**
 * useSecretEntry — how the hidden space is discovered.
 *
 * THREE ROUTES IN, so that no input method is privileged:
 *   1. A discoverable spatial element on the hub — the ambient "signal" object,
 *      which is a real focusable button (so a keyboard or screen-reader user
 *      finds it by tabbing, exactly as a sighted mouse user finds it by looking).
 *   2. Shift+V from anywhere.
 *   3. Typing the phrase "explore" anywhere outside a text field.
 *
 * WHAT IT MUST NEVER DO (stated in the brief, enforced here)
 *   • It must not block navigation — the handler ignores keys while focus is in a
 *     text field, and it never preventDefault()s an ordinary keystroke.
 *   • It must not fake a system breach. Nothing here pretends to access files,
 *     steal data or "hack" anything. It opens a page, and that page says plainly
 *     what it is.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SECRET } from '@/content';
import { SECRET_ROUTE } from '@/app/routes';
import { useUIStore } from '@/store/useUIStore';
import { playSfx } from '@/store/useSoundStore';

const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';

export function useSecretEntry(): { enter: (from: 'signal' | 'key' | 'phrase') => void } {
  const navigate = useNavigate();
  const markSecretUnlocked = useUIStore((s) => s.markSecretUnlocked);
  const bufferRef = useRef('');

  const enter = (from: 'signal' | 'key' | 'phrase') => {
    markSecretUnlocked();
    playSfx('unlock');
    navigate(SECRET_ROUTE.path, { state: { from } });
  };

  useEffect(() => {
    const phrase = SECRET.phrase.toLowerCase().replace(/\s+/g, '');

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      // Never interfere with typing. This is the guard that keeps the site usable.
      if (target && target.closest(TEXT_ENTRY)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Shift+V
      if (e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        enter('key');
        return;
      }

      // Typed phrase, accumulated one printable character at a time.
      if (e.key.length !== 1) return;
      const buffer = (bufferRef.current + e.key.toLowerCase()).replace(/\s+/g, '');
      bufferRef.current = buffer.slice(-phrase.length);
      if (bufferRef.current === phrase) {
        bufferRef.current = '';
        enter('phrase');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // `enter` is recreated each render but only closes over stable store actions
    // and `navigate`, so re-subscribing on every render would be wasteful yet
    // harmless. Depending on nothing keeps the listener installed exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { enter };
}
