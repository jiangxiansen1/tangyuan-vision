/**
 * GestureHud — the low-presence liquid-glass status bar on /earth.
 *
 * Every value reads the REAL shared gesture session (gestureSession.snapshot()):
 * camera status, whether a hand is currently detected, whether a globe target is
 * attached, and the session's own detail/error text. Nothing here is on a timer
 * and nothing fakes a detected hand. The toggle drives the real enable/disable
 * path (permission request + local model load only after the visitor clicks).
 *
 * The left/right hand split and the full interaction mode belong to Stage 2 C;
 * this bar shows what the session can truthfully report today and will gain those
 * fields when the dual-hand state machine lands.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GlobeControlApi } from '@/features/earth/EarthGlobe';
import { gestureSession, type GestureSnapshot } from '@/features/earth/gesture/gestureSession';

const MODE_LABEL: Record<GestureSnapshot['mode'], string> = {
  off: '关闭',
  waiting: '待识别',
  single: '单手',
  dual: '双手',
  select: '选区',
  reset: '重置确认',
  lost: '追踪中断',
};

const CAMERA_LABEL: Record<GestureSnapshot['status'], string> = {
  off: '关闭',
  requesting: '启动中',
  running: '运行中',
  denied: '未授权',
  unavailable: '不可用',
  error: '错误',
};

export interface GestureHudProps {
  control?: MutableRefObject<GlobeControlApi | null>;
}

export function GestureHud({ control }: GestureHudProps) {
  const [snap, setSnap] = useState<GestureSnapshot>(() => gestureSession.snapshot());

  useEffect(() => {
    const read = () => setSnap(gestureSession.snapshot());
    read();
    return gestureSession.subscribe(read);
  }, []);

  useEffect(() => {
    gestureSession.attach();
    if (control) gestureSession.setTarget(control);
    return () => {
      if (control) gestureSession.clearTarget(control);
      gestureSession.detach();
    };
  }, [control]);

  const onToggle = useCallback(() => gestureSession.toggle(), []);
  const on = snap.status === 'running' || snap.status === 'requesting';

  return (
    <div className="ghud glass glass--standard" data-status={snap.status}>
      <div className="ghud__row">
        <button type="button" className="ghud__toggle" aria-pressed={on} onClick={onToggle}>
          <Icon name="sparkle" size={13} />
          <span>{on ? '关闭手势' : '开启手势'}</span>
        </button>
        <dl className="ghud__status">
          <div>
            <dt className="u-label">摄像头</dt>
            <dd className="u-mono">{CAMERA_LABEL[snap.status]}</dd>
          </div>
          <div>
            <dt className="u-label">左手</dt>
            <dd className="u-mono">{snap.hands.left ? '已识别' : '未识别'}</dd>
          </div>
          <div>
            <dt className="u-label">右手</dt>
            <dd className="u-mono">{snap.hands.right ? '已识别' : '未识别'}</dd>
          </div>
          <div>
            <dt className="u-label">模式</dt>
            <dd className="u-mono">{MODE_LABEL[snap.mode]}</dd>
          </div>
          <div>
            <dt className="u-label">目标</dt>
            <dd className="u-mono">{snap.hasTarget ? '已连接' : '—'}</dd>
          </div>
        </dl>
      </div>
      {snap.detail ? (
        <p className="ghud__hint">{snap.detail}</p>
      ) : !on ? (
        <p className="ghud__hint ghud__hint--quiet">
          摄像头默认关闭；点击后才会申请权限并加载本地识别模型。识别在本机完成，画面不上传。鼠标与触控始终可用。
        </p>
      ) : null}
    </div>
  );
}
