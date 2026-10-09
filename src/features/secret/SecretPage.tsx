/**
 * SecretPage — 静默空间 / THE QUIET SPACE.
 *
 * BOUNDARIES THIS PAGE OBEYS (each is an explicit requirement)
 *   • No fake intrusion. Nothing here claims to read files, capture input, scan a
 *     network or "hack" anything. Those experiences are misleading theatre, and
 *     the page says what it actually is.
 *   • Real exit. Three ways back to the main space, plus the browser's own back
 *     button, plus a visible route that does not depend on having entered a
 *     particular way.
 *   • Keyboard operable throughout; the entry does not require a mouse.
 *   • Unwritten content is labelled `unwritten`, not padded with invented prose.
 *   • `noindex` — a hidden page that gets indexed is no longer hidden.
 *
 * VISUALLY
 * Same material system, much lower light. The ambient drops, the accent shifts to
 * violet, and the glass grows quieter. It should feel like the same building with
 * the lights off, not a different website.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND, SECRET } from '@/content';
import { NAVIGABLE_ROUTES, SECRET_ROUTE } from '@/app/routes';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/brand/Logo';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { playSfx } from '@/store/useSoundStore';
import { ImmersiveReturn } from './ImmersiveReturn';
import './secret.css';

export default function SecretPage() {
  const navigate = useNavigate();
  const [manifestoOpen, setManifestoOpen] = useState(true);

  useDocumentTitle({
    title: SECRET.title,
    description: '一处不会被导航标记的地方。',
    path: SECRET_ROUTE.path,
    noindex: true,
  });

  const leave = useCallback(
    (to: string) => {
      playSfx('close');
      navigate(to);
    },
    [navigate]
  );

  // The hidden space has no chrome of its own, so Escape returns to the hub.
  // This is the keyboard user's guaranteed exit and it is never intercepted.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        leave('/');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leave]);

  return (
    <div className="scene secret" data-scene="secret">
      <div className="scene-ambient" aria-hidden="true" />
      <div className="secret__field" aria-hidden="true">
        <span className="secret__star" />
        <span className="secret__star" />
        <span className="secret__star" />
        <span className="secret__star" />
        <span className="secret__star" />
      </div>
      <div className="scene__grain" aria-hidden="true" />

      {/* ------------------------------------------------------------ entry -- */}
      <header className="secret__bar no-print">
        <div className="secret__bar-mark">
          <Logo height={24} />
        </div>

        <nav className="secret__exit" aria-label="离开这里">
          <Button
            variant="glass"
            size="sm"
            icon="arrow-left"
            onClick={() => leave('/')}
            title="返回主空间（Esc）"
          >
            返回主空间
          </Button>
        </nav>
      </header>

      <main className="secret__main">
        <div className="secret__hero">
          <p className="secret__eyebrow u-label">
            <Icon name="lock" size={13} />
            {SECRET.titleEn}
          </p>

          <h1 className="secret__title">{SECRET.title}</h1>

          <p className="secret__lede">
            你找到的是一处没有被任何导航链接过的页面。这里没有隐藏的后门，也没有任何被伪装成
            「入侵」的效果——它只是一个我用来放半成品想法的地方。
          </p>
        </div>

        {/* ------------------------------------------------------ manifesto -- */}
        <section className="secret__manifesto" aria-labelledby="secret-manifesto">
          <div className="secret__manifesto-head">
            <h2 id="secret-manifesto" className="u-label">
              来这里想说的事
            </h2>
            <button
              type="button"
              className="secret__manifesto-toggle"
              aria-expanded={manifestoOpen}
              onClick={() => setManifestoOpen((o) => !o)}
            >
              {manifestoOpen ? '收起' : '展开'}
            </button>
          </div>

          {manifestoOpen ? (
            <div className="secret__manifesto-body">
              {SECRET.manifesto.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------------- artifacts -- */}
        <section className="secret__artifacts" aria-labelledby="secret-places">
          <div className="secret__section-head">
            <h2 id="secret-places" className="u-label">
              留给以后的位置
            </h2>
            <p className="secret__section-note">
              这几格现在是空的。空着也是这个页面的一部分——我不会往里面填看起来像内容的东西。
            </p>
          </div>

          <ul className="secret__grid">
            {SECRET.artifacts.map((artifact, i) => (
              <li key={artifact.id}>
                <GlassSurface tier="standard" className="secret__cell" radius="var(--r-lg)">
                  <span className="secret__cell-index u-mono">{String(i + 1).padStart(2, '0')}</span>

                  <h3 className="secret__cell-label">{artifact.label}</h3>
                  <p className="secret__cell-body">{artifact.body}</p>

                  <span
                    className="secret__cell-state"
                    data-state={artifact.state}
                  >
                    {artifact.state === 'unwritten' ? '尚未写下' : '已写下'}
                  </span>
                </GlassSurface>
              </li>
            ))}
          </ul>
        </section>

        {/* ----------------------------------------------------- how it works -- */}
        <section className="secret__how" aria-labelledby="secret-how">
          <div className="secret__section-head">
            <h2 id="secret-how" className="u-label">
              你是怎么进来的
            </h2>
            <p className="secret__section-note">
              这不是漏洞，是设计。入口有三条，任何一条都不需要鼠标。
            </p>
          </div>

          <dl className="secret__how-list">
            <div>
              <dt>
                <Icon name="sparkle" size={14} />
                主空间里的那个暗点
              </dt>
              <dd>
                在窗口阵列的最后一格。它看起来不像一个入口，但它是一个真正的按钮——
                用 Tab 就能走到，回车即可进入。
              </dd>
            </div>
            <div>
              <dt>
                <Icon name="keyboard" size={14} />
                <kbd>Shift</kbd> + <kbd>V</kbd>
              </dt>
              <dd>在站内任意位置按下即可。这个组合键不会与浏览器的任何默认快捷键冲突。</dd>
            </div>
            <div>
              <dt>
                <Icon name="keyboard" size={14} />
                直接输入 <kbd>explore</kbd>
              </dt>
              <dd>
                在任意非输入框位置连续输入这七个字母。焦点在输入框里时这个监听器会让位，
                不会打断你打字。
              </dd>
            </div>
          </dl>
        </section>

        {/* ----------------------------------------------------------- exit -- */}
        <ImmersiveReturn />
      </main>

      <footer className="secret__footer no-print">
        <span className="u-label">{BRAND.logoLine}</span>
        <div className="secret__footer-links">
          {NAVIGABLE_ROUTES.map((r) => (
            <Link key={r.id} to={r.path} className="secret__footer-link" onClick={() => playSfx('navigate')}>
              {r.label}
            </Link>
          ))}
        </div>
      </footer>

      {/* Nothing here is gated behind a modal, and there is deliberately NO focus
          trap. A hidden page might seem the natural place for one, but trapping
          focus on a page a keyboard user found by accident would be hostile —
          they must be able to Tab or Escape straight back out. This live region
          announces the one piece of state that changes in place. */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {manifestoOpen ? '静默空间宣言已展开' : '静默空间宣言已收起'}
      </span>
    </div>
  );
}
