/**
 * ProjectsPage — the portfolio.
 *
 * The link rule is enforced in the UI, not just in the content file: a project
 * with `repoUrl: null` renders an explicit "待填写" marker rather than a disabled
 * button that looks like a real link, and rather than a plausible-looking URL
 * that goes nowhere. The brief is explicit that an unprovided repository address
 * must not be invented, so the interface states the absence.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PROJECTS, SETTINGS } from '@/content';
import type { Project } from '@/content/types';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { ProvenanceBadge, PendingMarker } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRevealOnView } from '@/hooks/useRevealOnView';
import { playSfx } from '@/store/useSoundStore';
import { GitHubRepos } from './GitHubRepos';
import './projects.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'projects')!;

const STATUS_LABEL: Record<Project['status'], { label: string; tone: string }> = {
  shipped: { label: '已完成', tone: 'ok' },
  building: { label: '进行中', tone: 'accent' },
  exploring: { label: '探索中', tone: 'warn' },
  paused: { label: '已暂停', tone: 'muted' },
};

type Filter = 'all' | Project['status'];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'shipped', label: '已完成' },
  { value: 'building', label: '进行中' },
  { value: 'exploring', label: '探索中' },
  { value: 'paused', label: '已暂停' },
];

export default function ProjectsPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: PROJECTS[0]?.cover ?? SETTINGS.ogImage,
    path: route.path,
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(PROJECTS[0]?.id ?? null);

  const visible = filter === 'all' ? PROJECTS : PROJECTS.filter((p) => p.status === filter);

  return (
    <SceneLayout route={route} bodyClassName="projects">
      <div className="scene__grid" aria-hidden="true" />

      {/* ------------------------------------------------------------ filters -- */}
      <div className="projects__filters" role="group" aria-label="按状态筛选项目">
        {FILTERS.map((f) => {
          const count = f.value === 'all' ? PROJECTS.length : PROJECTS.filter((p) => p.status === f.value).length;
          return (
            <button
              key={f.value}
              type="button"
              className="projects__filter"
              aria-pressed={filter === f.value}
              disabled={count === 0}
              onClick={() => {
                setFilter(f.value);
                playSfx('select');
              }}
            >
              <span>{f.label}</span>
              <span className="projects__filter-count u-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="placeholder">
          <p className="placeholder__title">这个状态下没有项目</p>
          <p className="u-caption">换一个筛选条件看看。</p>
        </div>
      ) : (
        <ul className="projects__list">
          {visible.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={i}
              open={expanded === project.id}
              onToggle={() => setExpanded((cur) => (cur === project.id ? null : project.id))}
            />
          ))}
        </ul>
      )}

      <div className="projects__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>
          <GitHubRepos />
    </SceneLayout>
  );
}

/* ------------------------------------------------------------------------ */

function ProjectCard({
  project,
  index,
  open,
  onToggle,
}: {
  project: Project;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const reveal = useRevealOnView<HTMLLIElement>({ delay: Math.min(index, 4) * 70, threshold: 0.04 });
  const status = STATUS_LABEL[project.status];
  const panelId = `project-panel-${project.id}`;

  const hasLinks = Boolean(project.repoUrl || project.demoUrl);

  return (
    <li ref={reveal.ref} className={`${reveal.className} projects__item`} style={reveal.style}>
      <GlassSurface tier="depth" className="projects__card" radius="var(--r-xl)">
        {/* --------------------------------------------------------- cover -- */}
        <div className="projects__cover">
          {project.cover ? (
            <SmartImage
              src={project.cover}
              alt=""
              width={1200}
              height={760}
              tone="#141d2c"
              sizes="(max-width: 767px) 92vw, 34vw"
              className="projects__cover-image"
              failureLabel="封面未加载"
            />
          ) : (
            <div className="projects__cover-empty" aria-hidden="true">
              {/* A drawn placeholder rather than a stock image: an empty cover
                  should look deliberately reserved, not filled with something
                  that is not the project. */}
              <span className="projects__cover-grid" />
              <Icon name="layers" size={28} />
            </div>
          )}
          <span className="projects__cover-index u-mono">{String(index + 1).padStart(2, '0')}</span>
        </div>

        {/* ---------------------------------------------------------- body -- */}
        <div className="projects__body">
          <div className="row">
            <span
              className={`badge ${
                status.tone === 'ok'
                  ? 'badge--accent'
                  : status.tone === 'warn'
                    ? 'badge--warn'
                    : status.tone === 'muted'
                      ? 'badge--muted'
                      : ''
              }`}
            >
              <span className="badge__dot" aria-hidden="true" />
              {status.label}
            </span>
            <ProvenanceBadge provenance={project.provenance} />
          </div>

          <h3 className="projects__name">
            {project.name}
            {project.nameEn ? <span className="projects__name-en u-label">{project.nameEn}</span> : null}
          </h3>

          <p className="projects__summary">{project.summary}</p>

          {project.stack.length > 0 ? (
            <ul className="projects__stack" aria-label="技术栈">
              {project.stack.map((tech) => (
                <li key={tech} className="badge">
                  {tech}
                </li>
              ))}
            </ul>
          ) : (
            <p className="u-caption text-dim">技术栈尚未填写。</p>
          )}

          {/* ------------------------------------------------------- links -- */}
          <div className="projects__links">
            {project.demoUrl ? (
              <a
                className="btn btn--line btn--sm"
                href={project.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="arrow-out" size={15} />
                <span>演示地址</span>
              </a>
            ) : (
              <span className="projects__link-pending">
                <PendingMarker label="演示地址待填写" />
              </span>
            )}

            {project.repoUrl ? (
              <a
                className="btn btn--line btn--sm"
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="arrow-out" size={15} />
                <span>代码仓库</span>
              </a>
            ) : (
              <span className="projects__link-pending">
                <PendingMarker label="仓库地址待填写" />
              </span>
            )}
          </div>

          {/* -------------------------------------------------------- detail -- */}
          <button
            type="button"
            className="projects__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            <span>{open ? '收起项目详情' : '展开项目详情'}</span>
            <Icon name={open ? 'chevron-left' : 'chevron-right'} size={15} />
          </button>

          {open ? (
            <div id={panelId} className="projects__detail">
              <p>{project.detail}</p>

              {project.highlights && project.highlights.length > 0 ? (
                <ul className="projects__highlights">
                  {project.highlights.map((h) => (
                    <li key={h}>
                      <Icon name="check" size={13} />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {!hasLinks ? (
                <p className="projects__detail-note">
                  这个项目还没有填写仓库地址或演示地址。我没有生成占位链接——一个看起来能点但打不开的地址，
                  比诚实地说明「未提供」更糟。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </GlassSurface>
    </li>
  );
}
