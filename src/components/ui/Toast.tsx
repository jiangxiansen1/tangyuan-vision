/**
 * Toast — transient status messages.
 *
 * Used for the honest failure reports the brief requires: an audio file that is
 * missing, an image that could not load, a navigation that did nothing. The
 * message is never a substitute for a persistent state — anything long-lived is
 * rendered in the UI where it belongs; a toast is for the moment it happens.
 *
 * Implemented without a library: one element, one timer, auto-dismiss, and a
 * dismiss button so a keyboard user is not forced to wait it out.
 */

import { useEffect } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { Icon } from './Icon';
import './toast.css';

const DURATION = 6000;

export function Toast() {
  const toast = useUIStore((s) => s.toast);
  const clearToast = useUIStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(clearToast, DURATION);
    return () => window.clearTimeout(t);
  }, [toast, clearToast]);

  // role="status" is polite: a toast must never interrupt what the visitor is
  // reading. Nothing here is an error the visitor must act on this second.
  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {toast ? (
        <div className="toast" key={toast.id} data-tone={toast.tone}>
          <Icon name={toast.tone === 'warn' ? 'alert' : toast.tone === 'ok' ? 'check' : 'sparkle'} size={16} />
          <p className="toast__message">{toast.message}</p>
          <button type="button" className="toast__close" onClick={clearToast} aria-label="关闭提示">
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
