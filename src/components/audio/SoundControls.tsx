/**
 * SoundControls — independent music and effect controls.
 *
 * Requirements this satisfies, and how:
 *   • Separate controls. Two distinct buttons, two persisted preferences, two
 *     independent gain nodes in the audio graph (src/lib/sound.ts).
 *   • Default muted. Both flags read from storage with a `false` default, and
 *     nothing initialises an AudioContext until the visitor presses a control —
 *     browsers block it before a gesture anyway, so this also avoids a console
 *     warning on every page load.
 *   • Clear current state. Each control is a real toggle button with
 *     `aria-pressed`, so the state is available to assistive tech without
 *     relying on the icon.
 *   • Graceful degradation. If the ambient file is absent — the shipped default
 *     — enabling music reports that once and leaves everything else working,
 *     rather than failing silently or throwing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useSoundStore, playSfx } from '@/store/useSoundStore';
import { useUIStore } from '@/store/useUIStore';
import './sound-controls.css';

export interface SoundControlsProps {
  /** Icon-only, for the scene chrome. */
  compact?: boolean;
  /** Show the volume sliders inline (used in the settings panel). */
  withVolume?: boolean;
}

export function SoundControls({ compact = false, withVolume = false }: SoundControlsProps) {
  const {
    musicEnabled,
    sfxEnabled,
    musicVolume,
    sfxVolume,
    musicAvailable,
    probed,
    toggleMusic,
    toggleSfx,
    setMusicVolume,
    setSfxVolume,
    probe,
  } = useSoundStore();
  const pushToast = useUIStore((s) => s.pushToast);
  const [busy, setBusy] = useState<'music' | 'sfx' | null>(null);
  // Only warn about the missing ambient file once per session.
  const warnedRef = useRef(false);

  // Probe the optional ambient bed the first time the visitor shows interest,
  // not on page load: a visitor who never enables sound should not pay for a
  // request at all.
  const onToggleMusic = useCallback(async () => {
    setBusy('music');
    try {
      await toggleMusic();
      const { musicEnabled: nowOn, musicAvailable: available } = useSoundStore.getState();
      if (nowOn && !available && !warnedRef.current) {
        warnedRef.current = true;
        pushToast('背景音乐文件尚未提供（assets/audio/ambient.m4a），已保留开关状态。', 'warn');
      } else if (nowOn) {
        playSfx('toggle');
      }
    } finally {
      setBusy(null);
    }
  }, [pushToast, toggleMusic]);

  const onToggleSfx = useCallback(async () => {
    setBusy('sfx');
    try {
      await toggleSfx();
      // Confirm audibly that effects are now on — the clearest possible state
      // feedback for a sound setting.
      if (useSoundStore.getState().sfxEnabled) playSfx('toggle');
    } finally {
      setBusy(null);
    }
  }, [toggleSfx]);

  // Keep the availability flag honest if the file disappears mid-session.
  useEffect(() => {
    if (musicEnabled && !probed) void probe();
  }, [musicEnabled, probed, probe]);

  return (
    <div className={`sound ${compact ? 'sound--compact' : ''}`} role="group" aria-label="声音控制">
      <button
        type="button"
        className="sound__btn"
        onClick={onToggleMusic}
        aria-pressed={musicEnabled}
        aria-busy={busy === 'music' || undefined}
        title={musicEnabled ? '关闭背景音乐' : '开启背景音乐'}
        data-unavailable={!musicAvailable && probed ? 'true' : undefined}
      >
        <Icon name={musicEnabled ? 'music' : 'music'} size={compact ? 16 : 18} />
        {!compact ? (
          <span className="sound__label">
            背景音乐
            <span className="sound__state">{musicEnabled ? 'ON' : 'OFF'}</span>
          </span>
        ) : null}
        {compact ? <span className="visually-hidden">背景音乐 {musicEnabled ? '已开启' : '已关闭'}</span> : null}
      </button>

      <button
        type="button"
        className="sound__btn"
        onClick={onToggleSfx}
        aria-pressed={sfxEnabled}
        aria-busy={busy === 'sfx' || undefined}
        title={sfxEnabled ? '关闭交互音效' : '开启交互音效'}
      >
        <Icon name={sfxEnabled ? 'sound-on' : 'sound-off'} size={compact ? 16 : 18} />
        {!compact ? (
          <span className="sound__label">
            交互音效
            <span className="sound__state">{sfxEnabled ? 'ON' : 'OFF'}</span>
          </span>
        ) : null}
        {compact ? <span className="visually-hidden">交互音效 {sfxEnabled ? '已开启' : '已关闭'}</span> : null}
      </button>

      {withVolume ? (
        <div className="sound__volumes">
          <label className="sound__volume">
            <span className="u-label">音乐音量</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(musicVolume * 100)}
              onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
              disabled={!musicEnabled}
              aria-label="背景音乐音量"
            />
            <output className="sound__volume-value">{Math.round(musicVolume * 100)}</output>
          </label>

          <label className="sound__volume">
            <span className="u-label">音效音量</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sfxVolume * 100)}
              onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
              disabled={!sfxEnabled}
              aria-label="交互音效音量"
            />
            <output className="sound__volume-value">{Math.round(sfxVolume * 100)}</output>
          </label>
        </div>
      ) : null}

      {/* The availability note is a real DOM statement, not a tooltip, so it is
          reachable by keyboard and by screen readers alike. */}
      {!compact && probed && !musicAvailable ? (
        <p className="sound__note">
          背景音乐文件未提供，开关状态已保存。放入 <code>public/assets/audio/ambient.m4a</code> 即可生效。
        </p>
      ) : null}
    </div>
  );
}
