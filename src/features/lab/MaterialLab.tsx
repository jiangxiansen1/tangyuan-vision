/**
 * MaterialLab — a real, inspectable demonstration of the glass system.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A FAKE CONSOLE
 * The brief asks for an "interactive technical demonstration" in the lab, and
 * simultaneously forbids fabricated model status, fake logs and invented AI
 * capabilities. A materials playground satisfies both: it demonstrates something
 * that genuinely exists in this codebase, it can be inspected and verified in
 * devtools, and every control has a real, measurable effect on the DOM.
 *
 * Each control writes a CSS custom property onto the specimen surface — the very
 * same variables glass.css consumes. Moving a slider really does change the
 * material, and the readout really is the value in use, read back from the
 * computed style rather than echoed from state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import './material-lab.css';

interface Knob {
  key: string;
  label: string;
  variable: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  initial: number;
  note: string;
}

const KNOBS: Knob[] = [
  {
    key: 'blur',
    label: '背景模糊',
    variable: '--glass-blur',
    min: 0,
    max: 44,
    step: 1,
    unit: 'px',
    initial: 28,
    note: 'backdrop-filter 的模糊半径，是玻璃最基础的层次。',
  },
  {
    key: 'tint',
    label: '体色浓度',
    variable: '--glass-tint-opacity',
    min: 0,
    max: 0.92,
    step: 0.02,
    unit: '',
    initial: 0.5,
    note: '::before 上体色渐变的不透明度，决定面板有多“实”。',
  },
  {
    key: 'edge',
    label: '边缘高光',
    variable: '--glass-edge-light',
    min: 0,
    max: 1,
    step: 0.02,
    unit: '',
    initial: 0.36,
    note: '内描边渐变顶端的亮度，是玻璃“有厚度”的关键。',
  },
  {
    key: 'spec',
    label: '指针光泽',
    variable: '--glass-specular-opacity',
    min: 0,
    max: 1,
    step: 0.02,
    unit: '',
    initial: 0.6,
    note: '跟随鼠标的镜面高光强度（触屏设备上不会显示）。',
  },
];

const PRESETS = [
  { id: 'obsidian', label: '曜石', values: { blur: 34, tint: 0.62, edge: 0.4, spec: 0.5 } },
  { id: 'crystal', label: '水晶体', values: { blur: 12, tint: 0.16, edge: 0.72, spec: 0.9 } },
  { id: 'frosted', label: '磨砂', values: { blur: 44, tint: 0.78, edge: 0.22, spec: 0.28 } },
  { id: 'membrane', label: '薄膜', values: { blur: 6, tint: 0.24, edge: 0.86, spec: 1 } },
] as const;

export function MaterialLab() {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(KNOBS.map((k) => [k.key, k.initial]))
  );
  const [preset, setPreset] = useState<string>('custom');
  const [readback, setReadback] = useState<Record<string, string>>({});
  const [showRaw, setShowRaw] = useState(false);
  const specimenRef = useRef<HTMLDivElement>(null);

  /** Apply a value to the specimen as a CSS custom property. */
  const apply = useCallback((knob: Knob, value: number) => {
    specimenRef.current?.style.setProperty(knob.variable, `${value}${knob.unit}`);
  }, []);

  useEffect(() => {
    for (const knob of KNOBS) apply(knob, values[knob.key]);
  }, [values, apply]);

  /**
   * Read the values back out of the computed style. This is the honest part: the
   * readout shows what the browser actually resolved, not what React thinks it
   * set, so a variable that fails to apply shows up as a discrepancy.
   */
  const inspect = useCallback(() => {
    const el = specimenRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const next: Record<string, string> = {};
    for (const knob of KNOBS) {
      next[knob.key] = cs.getPropertyValue(knob.variable).trim() || '(未解析)';
    }
    next['backdropFilter'] = cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || '(不支持)';
    next['support'] = CSS.supports('backdrop-filter', 'blur(1px)') ? 'backdrop-filter 可用' : 'backdrop-filter 不可用';
    setReadback(next);
  }, []);

  const setKnob = (knob: Knob, value: number) => {
    setPreset('custom');
    setValues((v) => ({ ...v, [knob.key]: value }));
  };

  const applyPreset = (id: string) => {
    const found = PRESETS.find((p) => p.id === id);
    if (!found) return;
    setPreset(id);
    setValues({ ...found.values });
  };

  const reset = () => applyPreset('obsidian');

  return (
    <div className="mlab">
      {/* --------------------------------------------------------- specimen -- */}
      <div className="mlab__stage">
        {/* A deliberately busy backdrop. Glass over a flat colour demonstrates
            nothing — the material only reads against content with structure. */}
        <div className="mlab__backdrop" aria-hidden="true">
          <span className="mlab__backdrop-grid" />
          <span className="mlab__backdrop-orb mlab__backdrop-orb--a" />
          <span className="mlab__backdrop-orb mlab__backdrop-orb--b" />
          <span className="mlab__backdrop-text">CAPTURE MOMENTS</span>
        </div>

        <div className="mlab__specimen-wrap">
          <GlassSurface
            as="div"
            tier="depth"
            className="mlab__specimen"
            radius="var(--r-2xl)"
            ref={specimenRef}
          >
            <div className="mlab__specimen-content">
              <span className="u-label">SPECIMEN</span>
              <p className="mlab__specimen-title">液态玻璃样本</p>
              <p className="mlab__specimen-body">
                这块面板使用的是产品中同一套 <code>.glass</code> 材质与同一组变量。
                调整下面的参数，改动会直接作用在它身上——不是预览图。
              </p>
              <Button
                variant="glass"
                size="sm"
                icon="sparkle"
                onClick={inspect}
                className="mlab__inspect-btn"
              >
                读取当前计算值
              </Button>
            </div>
          </GlassSurface>
        </div>
      </div>

      {/* ----------------------------------------------------------- knobs -- */}
      <div className="mlab__controls">
        <div className="mlab__presets" role="group" aria-label="材质预设">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="mlab__preset"
              aria-pressed={preset === p.id}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <Button variant="ghost" size="sm" icon="close" onClick={reset} aria-label="恢复默认值">
            重置
          </Button>
        </div>

        <div className="mlab__knobs">
          {KNOBS.map((knob) => (
            <div key={knob.key} className="mlab__knob">
              <label className="mlab__knob-label" htmlFor={`mlab-${knob.key}`}>
                <span>{knob.label}</span>
                <code>{knob.variable}</code>
              </label>

              <div className="mlab__knob-row">
                <input
                  id={`mlab-${knob.key}`}
                  type="range"
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  value={values[knob.key]}
                  onChange={(e) => setKnob(knob, Number(e.target.value))}
                />
                <output className="mlab__knob-value u-mono">
                  {knob.unit === 'px'
                    ? `${values[knob.key].toFixed(0)}px`
                    : values[knob.key].toFixed(2)}
                </output>
              </div>

              <p className="mlab__knob-note">{knob.note}</p>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------------- readout -- */}
        <div className="mlab__readout">
          <div className="mlab__readout-head">
            <span className="u-label">计算值 / COMPUTED</span>
            <button
              type="button"
              className="mlab__raw-toggle"
              aria-expanded={showRaw}
              onClick={() => setShowRaw((s) => !s)}
            >
              {showRaw ? '收起' : '展开'}
            </button>
          </div>

          {Object.keys(readback).length === 0 ? (
            <p className="mlab__readout-empty">
              点击样本上的「读取当前计算值」按钮。这里显示的是浏览器实际解析出的值，
              而不是面板上滑块的数值——两者不一致时说明某个变量没有被应用。
            </p>
          ) : showRaw ? (
            <dl className="mlab__readout-list">
              {Object.entries(readback).map(([k, v]) => (
                <div key={k}>
                  <dt className="u-mono">{k}</dt>
                  <dd className="u-mono">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mlab__readout-summary">
              <Icon name="check" size={14} />
              <span>{readback.support}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
