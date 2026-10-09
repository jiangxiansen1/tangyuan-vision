/**
 * LabPage — the AI / programming notebook.
 *
 * WHAT THIS IS
 * A record of experiments. Each entry is structured as: the question, the
 * approach, the outcome. That structure is deliberate — it is the shape of an
 * honest technical note, and it forces the "outcome" field to be filled even
 * when the answer is "this did not work", which is the part most project pages
 * quietly omit.
 *
 * WHAT THIS IS NOT
 * Not a fake AI console. There are no fabricated model status readouts, no
 * scrolling pseudo-logs, no invented inference latencies. The instrumentation
 * styling is used to present real data from the content files, and the one
 * interactive element is a genuine demonstration of the site's own liquid-glass
 * material — something that can actually be inspected and verified.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LAB_NOTES, SETTINGS } from '@/content';
import type { LabNote } from '@/content/types';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRevealOnView } from '@/hooks/useRevealOnView';
import { MaterialLab } from './MaterialLab';
import './lab.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'lab')!;

export default function LabPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: SETTINGS.ogImage,
    path: route.path,
  });

  const [openId, setOpenId] = useState<string | null>(LAB_NOTES[0]?.id ?? null);

  const realCount = LAB_NOTES.filter((n) => n.provenance === 'real').length;
  const allTools = Array.from(new Set(LAB_NOTES.flatMap((n) => n.tools))).sort();

  return (
    <SceneLayout route={route} bodyClassName="lab">
      <div className="scene__grid" aria-hidden="true" />

      {/* ------------------------------------------------------- summary bar -- */}
      <GlassSurface tier="standard" className="lab__stats" radius="var(--r-lg)">
        <dl>
          <div>
            <dt className="u-label">记录</dt>
            <dd>{LAB_NOTES.length}</dd>
          </div>
          <div>
            <dt className="u-label">其中真实记录</dt>
            <dd>{realCount}</dd>
          </div>
          <div>
            <dt className="u-label">涉及工具</dt>
            <dd>{allTools.length}</dd>
          </div>
          <div>
            <dt className="u-label">演示</dt>
            <dd>1</dd>
          </div>
        </dl>
        <p className="lab__stats-note">
          这些数字来自内容文件本身。没有伪造的运行状态、模型指标或系统日志——
          日志面板是最容易造假的界面元素，所以这里不提供它。
        </p>
      </GlassSurface>

      {/* ---------------------------------------------------------- entries -- */}
      <section className="section" aria-labelledby="lab-notes">
        <div className="section__head">
          <h2 id="lab-notes" className="section__title">
            实验记录
          </h2>
          <p className="u-label">EXPERIMENT LOG</p>
        </div>

        {LAB_NOTES.length === 0 ? (
          <div className="placeholder">
            <p className="placeholder__title">还没有实验记录</p>
            <p className="u-caption">
              在后台新增记录后，会按日期倒序显示在这里。
            </p>
          </div>
        ) : (
          <ul className="lab__list">
            {LAB_NOTES.map((note, i) => (
              <LabEntry
                key={note.id}
                note={note}
                index={i}
                open={openId === note.id}
                onToggle={() => setOpenId((cur) => (cur === note.id ? null : note.id))}
              />
            ))}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------------- material lab -- */}
      <section className="section" aria-labelledby="lab-material">
        <div className="section__head">
          <h2 id="lab-material" className="section__title">
            材质实验台
          </h2>
          <p className="u-label">INTERACTIVE · LIVE MATERIAL</p>
        </div>

        <MaterialLab />
      </section>

      {/* ------------------------------------------------------------ stack -- */}
      <section className="section" aria-labelledby="lab-stack">
        <div className="section__head">
          <h2 id="lab-stack" className="section__title">
            使用的工具
          </h2>
          <p className="u-label">{allTools.length} TOOLS</p>
        </div>

        {allTools.length === 0 ? (
          <p className="u-caption text-dim">暂无记录。</p>
        ) : (
          <ul className="lab__tools">
            {allTools.map((tool) => (
              <li key={tool} className="badge">
                {tool}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="lab__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>
    </SceneLayout>
  );
}

/* ------------------------------------------------------------------------ */

function LabEntry({
  note,
  index,
  open,
  onToggle,
}: {
  note: LabNote;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const reveal = useRevealOnView<HTMLLIElement>({ delay: Math.min(index, 5) * 60, threshold: 0.04 });
  const panelId = `lab-note-${note.id}`;

  return (
    <li ref={reveal.ref} className={`${reveal.className} lab__entry`} style={reveal.style}>
      <GlassSurface tier={open ? 'depth' : 'standard'} className="lab__entry-glass" radius="var(--r-xl)">
        <h3 className="lab__entry-heading">
          <button
            type="button"
            className="lab__entry-trigger"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            <span className="lab__entry-index u-mono">{String(index + 1).padStart(2, '0')}</span>

            <span className="lab__entry-titles">
              <span className="lab__entry-title">{note.title}</span>
              {note.titleEn ? <span className="lab__entry-en u-label">{note.titleEn}</span> : null}
            </span>

            <span className="lab__entry-meta">
              {note.date ? <span className="u-mono lab__entry-date">{note.date}</span> : null}
              <ProvenanceBadge provenance={note.provenance} compact />
            </span>

            <span className="lab__entry-chevron" aria-hidden="true">
              <Icon name={open ? 'chevron-left' : 'chevron-right'} size={16} />
            </span>
          </button>
        </h3>

        {/* The panel is only in the DOM when open, so its content cannot be
            reached by Tab while collapsed — which is what aria-expanded implies. */}
        {open ? (
          <div id={panelId} className="lab__entry-body">
            <div className="lab__qa">
              <div className="lab__qa-item">
                <span className="lab__qa-label u-label">问题 / QUESTION</span>
                <p>{note.question}</p>
              </div>

              <div className="lab__qa-item">
                <span className="lab__qa-label u-label">方法 / APPROACH</span>
                <p>{note.approach}</p>
              </div>

              <div className="lab__qa-item lab__qa-item--outcome">
                <span className="lab__qa-label u-label">结论 / OUTCOME</span>
                <p>{note.outcome}</p>
              </div>
            </div>

            {note.snippet ? (
              <figure className="lab__snippet">
                <figcaption className="u-label">
                  {note.snippet.language}
                  {note.snippet.caption ? ` · ${note.snippet.caption}` : ''}
                </figcaption>
                <pre>
                  <code>{note.snippet.code}</code>
                </pre>
              </figure>
            ) : null}

            {note.tools.length > 0 ? (
              <ul className="lab__entry-tools">
                {note.tools.map((tool) => (
                  <li key={tool} className="badge">
                    {tool}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </GlassSurface>
    </li>
  );
}
