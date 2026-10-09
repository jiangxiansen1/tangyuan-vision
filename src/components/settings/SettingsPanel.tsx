/**
 * SettingsPanel — the visitor's control over the experience.
 *
 * The brief asks for real user control over the effects, and for honest
 * reporting rather than pretending everything runs everywhere. So each control
 * here changes something that genuinely costs something to render:
 *
 *   • Glass quality — switches the refractive tier on and off, which is the
 *     single most expensive thing in the product.
 *   • Contrast — forces opaque surfaces, for readability rather than taste.
 *   • Motion — overrides the OS preference for this site only.
 *   • Sound — the two independent audio toggles, with volume.
 *
 * Every row explains its cost in plain language. No control here is decorative.
 */

import { useRef } from 'react';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { SoundControls } from '@/components/audio/SoundControls';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useUIStore } from '@/store/useUIStore';
import { useVisualStore, type GlassQuality } from '@/store/useVisualStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import './settings.css';

const GLASS_OPTIONS: Array<{ value: GlassQuality; label: string; note: string }> = [
  {
    value: 'high',
    label: '完整',
    note: '开启折射层与色散。视觉效果最好，GPU 占用也最高。',
  },
  {
    value: 'balanced',
    label: '均衡',
    note: '保留模糊与边缘高光，关闭折射滤镜。中端设备推荐。',
  },
  {
    value: 'off',
    label: '极简',
    note: '玻璃改为不透明表面。最低开销，也最适合阅读。',
  },
];

export function SettingsPanel() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const { glassQuality, contrast, setGlassQuality, setContrast } = useVisualStore();
  const { reduced, pref, setPref } = usePrefersReducedMotion();
  const isPhone = useMediaQuery('(max-width: 767px)');
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, {
    active: open,
    onEscape: () => setOpen(false),
  });

  if (!open) return null;

  return (
    <div className="settings">
      <div
        className="settings__scrim"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <GlassSurface
        as="div"
        tier="depth"
        solid
        radius="var(--r-2xl)"
        className="settings__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings__head">
          <div>
            <h2 id="settings-title" className="settings__title">
              显示与声音
            </h2>
            <p className="settings__sub u-label">Display &amp; Audio</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            onClick={() => setOpen(false)}
            aria-label="关闭设置"
          />
        </header>

        <div className="settings__body">
          {/* ---------------------------------------------------- glass -- */}
          <section className="settings__group" aria-labelledby="settings-glass">
            <h3 id="settings-glass" className="settings__group-title">
              玻璃材质质量
            </h3>
            <p className="settings__group-note">
              折射是真的：它会把面板背后的画面按湍流场位移，因此需要为每块面板额外分配一次离屏合成。
            </p>
            <div className="settings__options" role="radiogroup" aria-labelledby="settings-glass">
              {GLASS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={glassQuality === opt.value}
                  className="settings__option"
                  onClick={() => setGlassQuality(opt.value)}
                >
                  <span className="settings__option-head">
                    <span className="settings__radio" aria-hidden="true" />
                    <span className="settings__option-label">{opt.label}</span>
                  </span>
                  <span className="settings__option-note">{opt.note}</span>
                </button>
              ))}
            </div>
            {isPhone ? (
              <p className="settings__hint">
                <Icon name="alert" size={13} />
                当前视口小于 768px，折射层已自动关闭以保证滚动流畅。
              </p>
            ) : null}
          </section>

          {/* ------------------------------------------------- motion -- */}
          <section className="settings__group" aria-labelledby="settings-motion">
            <h3 id="settings-motion" className="settings__group-title">
              动态效果
            </h3>
            <p className="settings__group-note">
              开启后只简化转场、视差与形变，内容与功能完全保留。
              {reduced ? '当前处于简化模式。' : '当前为完整动态。'}
            </p>
            <div className="settings__options settings__options--row" role="radiogroup" aria-labelledby="settings-motion">
              {(
                [
                  { value: 'system', label: '跟随系统' },
                  { value: 'on', label: '简化' },
                  { value: 'off', label: '完整' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={pref === opt.value}
                  className="settings__chip"
                  onClick={() => setPref(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* ----------------------------------------------- contrast -- */}
          <section className="settings__group" aria-labelledby="settings-contrast">
            <h3 id="settings-contrast" className="settings__group-title">
              对比度
            </h3>
            <p className="settings__group-note">
              高对比模式会把所有半透明面板转为不透明，并移除光泽与色散。
            </p>
            <div className="settings__options settings__options--row" role="radiogroup" aria-labelledby="settings-contrast">
              <button
                type="button"
                role="radio"
                aria-checked={contrast === 'normal'}
                className="settings__chip"
                onClick={() => setContrast('normal')}
              >
                标准
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={contrast === 'high'}
                className="settings__chip"
                onClick={() => setContrast('high')}
              >
                高对比
              </button>
            </div>
          </section>

          {/* -------------------------------------------------- sound -- */}
          <section className="settings__group" aria-labelledby="settings-sound">
            <h3 id="settings-sound" className="settings__group-title">
              声音
            </h3>
            <p className="settings__group-note">
              默认全部关闭，只有你主动开启后才会发出声音。两者互相独立。
            </p>
            <SoundControls withVolume />
          </section>

          {/* ------------------------------------------- keyboard help -- */}
          <section className="settings__group" aria-labelledby="settings-keys">
            <h3 id="settings-keys" className="settings__group-title">
              键盘操作
            </h3>
            <dl className="settings__keys">
              <div>
                <dt>
                  <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd>
                </dt>
                <dd>按顺序移动焦点，任何功能都不需要鼠标</dd>
              </div>
              <div>
                <dt>
                  <kbd>Home</kbd>
                </dt>
                <dd>回到主空间</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>关闭灯箱、面板或设置</dd>
              </div>
              <div>
                <dt>
                  <kbd>←</kbd> <kbd>→</kbd>
                </dt>
                <dd>在灯箱内切换上一张 / 下一张</dd>
              </div>
              <div>
                <dt>主空间中</dt>
                <dd>用方向键在窗口之间移动，<kbd>Enter</kbd> 打开</dd>
              </div>
              <div>
                <dt>
                  <kbd>Shift</kbd>+<kbd>V</kbd>
                </dt>
                <dd>尝试进入那个不会被导航标记的地方</dd>
              </div>
            </dl>
          </section>
        </div>
      </GlassSurface>
    </div>
  );
}
