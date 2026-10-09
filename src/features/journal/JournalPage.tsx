/**
 * JournalPage — essays, statements and notes.
 *
 * Reads as a printed page rather than an app screen: a single measured column,
 * real typographic scale, and a dated list you can scan. The brief asks for
 * scrolling narration, so entries reveal as they come into view — but the text is
 * present and readable with JavaScript disabled, and reduced-motion renders it
 * flat, so nothing here depends on the effect.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, JOURNAL, SETTINGS } from '@/content';
import type { JournalEntry } from '@/content/types';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRevealOnView } from '@/hooks/useRevealOnView';
import './journal.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'journal')!;

const KIND_LABEL: Record<JournalEntry['kind'], string> = {
  essay: '随笔 / ESSAY',
  note: '宣言 / NOTE',
  log: '日志 / LOG',
};

export default function JournalPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: SETTINGS.ogImage,
    path: route.path,
  });

  const [activeId, setActiveId] = useState<string | null>(JOURNAL[0]?.id ?? null);
  const active = JOURNAL.find((e) => e.id === activeId) ?? JOURNAL[0] ?? null;

  return (
    <SceneLayout route={route} bodyClassName="journal">
      {/* -------------------------------------------------------- statement -- */}
      <section className="journal__masthead" aria-label="站内宣言">
        <p className="journal__masthead-text">{BRAND.tagline}</p>
        <p className="journal__masthead-en">{BRAND.taglineEn}</p>
      </section>

      {JOURNAL.length === 0 ? (
        <div className="placeholder">
          <p className="placeholder__title">还没有文章</p>
          <p className="u-caption">在后台新增随笔后会显示在这里。</p>
        </div>
      ) : (
        <div className="journal__layout">
          {/* ------------------------------------------------------- index -- */}
          <nav className="journal__index" aria-label="文章列表">
            <h2 className="u-label journal__index-title">目录 / INDEX</h2>
            <ol className="journal__index-list">
              {JOURNAL.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="journal__index-item"
                    aria-current={active?.id === entry.id ? 'true' : undefined}
                    onClick={() => setActiveId(entry.id)}
                  >
                    <span className="journal__index-date u-mono">{entry.date ?? '未标注日期'}</span>
                    <span className="journal__index-name">{entry.title}</span>
                    <span className="journal__index-kind u-label">{KIND_LABEL[entry.kind]}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {/* -------------------------------------------------------- reader -- */}
          <div className="journal__reader">
            {active ? <Entry key={active.id} entry={active} /> : null}
          </div>
        </div>
      )}

      <div className="journal__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>
    </SceneLayout>
  );
}

/* ------------------------------------------------------------------------ */

function Entry({ entry }: { entry: JournalEntry }) {
  const reveal = useRevealOnView<HTMLElement>({ threshold: 0.02 });

  return (
    <article ref={reveal.ref} className={`${reveal.className} journal__entry`} style={reveal.style}>
      <header className="journal__entry-head">
        <div className="row">
          <span className="badge">{KIND_LABEL[entry.kind]}</span>
          {entry.date ? <span className="u-mono journal__entry-date">{entry.date}</span> : null}
          <ProvenanceBadge provenance={entry.provenance} />
        </div>

        <h2 className="journal__entry-title">{entry.title}</h2>
        {entry.titleEn ? <p className="journal__entry-en u-label">{entry.titleEn}</p> : null}

        {entry.excerpt ? <p className="journal__entry-excerpt">{entry.excerpt}</p> : null}
      </header>

      {entry.body.length > 0 ? (
        <div className="journal__entry-body u-prose">
          {entry.body.map((paragraph, i) => (
            /* The first paragraph gets a drop-cap treatment, which is what makes
               this read as an essay rather than as more UI text. */
            <p key={i} className={i === 0 ? 'journal__lead' : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <div className="placeholder">
          <p className="placeholder__title">这篇还没有正文</p>
          <p className="u-caption">标题与摘要是真实的，正文等待填写。</p>
        </div>
      )}

      {entry.tags && entry.tags.length > 0 ? (
        <footer className="journal__entry-tags">
          {entry.tags.map((tag) => (
            <span key={tag} className="badge badge--muted">
              {tag}
            </span>
          ))}
        </footer>
      ) : null}

      {/* An aside explaining what this page demonstrates, kept visually separate
          from the author's own words so the two can never be confused. */}
      <GlassSurface tier="standard" className="journal__meta-note" radius="var(--r-md)">
        <Icon name="sparkle" size={14} />
        <p>
          本页正文用于展示排版与阅读体验。若这条随笔带有「示例 / SAMPLE」标记，
          说明它还不是本人的正式写作，请在后台替换为真实内容。
        </p>
      </GlassSurface>
    </article>
  );
}
