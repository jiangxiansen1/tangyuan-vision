/**
 * GestureControl — the UI shell over the shared gesture session.
 *
 * It owns no camera, no detector and no loop any more: those live in
 * gestureSession so that navigating between the home earth scene and /earth
 * cannot stop a session the visitor explicitly started. This component only
 *   • registers the control channel of the globe it belongs to (setTarget),
 *   • participates in the attach/detach grace window,
 *   • mirrors the session's status and (optionally) its camera preview.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GlobeControlApi } from '@/features/earth/EarthGlobe';
import { gestureSession, type GestureSnapshot } from '@/features/earth/gesture/gestureSession';

export interface GestureControlProps {
  /** The ref the local globe fills with its control API (see EarthGlobe). */
  control?: React.MutableRefObject<GlobeControlApi | null>;
  /** Show the small camera preview next to the button. */
  preview?: boolean;
  className?: string;
}

const STATE_TEXT: Record<GestureSnapshot['status'], string> = {
  off: 'OFF',
  requesting: 'STARTING',
  running: 'RUNNING',
  denied: 'DENIED',
  unavailable: 'N/A',
  error: 'ERROR',
};

export function GestureControl({ control, preview = false, className }: GestureControlProps) {
  const [snap, setSnap] = useState<GestureSnapshot>(() => gestureSession.snapshot());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const read = () => setSnap(gestureSession.snapshot());
    read();
    return gestureSession.subscribe(read);
  }, []);

  /* Join the earth experience and point the session at THIS globe. */
  useEffect(() => {
    gestureSession.attach();
    if (control) gestureSession.setTarget(control);
    return () => {
      if (control) gestureSession.clearTarget(control);
      gestureSession.detach();
    };
  }, [control]);

  /* Mirror the live stream into the small preview when one is shown. */
  useEffect(() => {
    if (!preview || !videoRef.current) return;
    videoRef.current.srcObject = snap.status === 'running' ? gestureSession.getStream() : null;
  }, [preview, snap.status]);

  const onToggle = useCallback(() => gestureSession.toggle(), []);

  return (
    <div className={'gctl' + (className ? ' ' + className : '')} data-status={snap.status}>
      <button
        type="button"
        className="gctl__toggle glass glass--standard"
        aria-pressed={snap.status === 'running'}
        onClick={onToggle}
      >
        <Icon name="sparkle" size={13} />
        <span>{snap.status === 'running' || snap.status === 'requesting' ? '关闭手势' : '开启手势'}</span>
        <span className="gctl__state u-mono">{STATE_TEXT[snap.status]}</span>
      </button>

      {preview && (snap.status === 'running' || snap.status === 'requesting') ? (
        <video ref={videoRef} className="gctl__video" muted playsInline aria-hidden="true" />
      ) : null}

      {snap.detail ? <p className="gctl__detail">{snap.detail}</p> : null}
      {snap.status === 'off' && !snap.detail ? (
        <p className="gctl__detail gctl__detail--quiet">
          可选增强：默认关闭，开启后才申请摄像头；关闭或离开地球体验会立即停止摄像头与识别。
          识别在本机完成，画面不上传。
        </p>
      ) : null}
      {snap.status === 'running' && !snap.hasTarget ? (
        <p className="gctl__detail gctl__detail--quiet">正在等待地球实例（切换页面时的一瞬间）。</p>
      ) : null}
    </div>
  );
}
