/**
 * Reticle — the low-presence scanning crosshair for gesture selection.
 *
 * Position comes from the SHARED gesture session's real reticle state (globe-canvas
 * NDC), so it sits exactly where `queryAtScreen` looked. It is shown only while the
 * state machine is in select mode. The name appears only after the machine has held
 * the SAME region ~0.25 s; the ring shows the ~0.8 s confirm progress. Nothing here
 * is on a timer — it mirrors real state.
 */
import { useEffect, useState } from 'react';
import { gestureSession, type GestureSnapshot } from './gestureSession';

export interface ReticleProps {
  /** Resolve a region id to its display label (from the page's GeoIndex). */
  labelOf: (id: string) => string | null;
}

export function Reticle({ labelOf }: ReticleProps) {
  const [snap, setSnap] = useState<GestureSnapshot>(() => gestureSession.snapshot());
  useEffect(() => {
    const read = () => setSnap(gestureSession.snapshot());
    read();
    return gestureSession.subscribe(read);
  }, []);

  const r = snap.reticle;
  if (!r.active) return null;

  const left = ((r.x + 1) / 2) * 100;
  const top = ((1 - r.y) / 2) * 100;
  const name = r.showName && r.targetId ? labelOf(r.targetId) : null;

  return (
    <div className="reticle" style={{ left: `${left}%`, top: `${top}%` }} data-locked={r.targetId ? true : undefined} aria-hidden="true">
      <span className="reticle__ring" />
      <span className="reticle__ticks" />
      <span className="reticle__progress" style={{ ['--p' as string]: String(r.progress) }} />
      {name ? <span className="reticle__name">{name}</span> : null}
    </div>
  );
}