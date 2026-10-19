/**
 * PhotographyPage — the portfolio.
 *
 * AN EDITORIAL VIEWER, NOT A GRID AND NOT A FEED.
 * The brief rejects "many identical rounded cards": the photograph is the
 * subject and the text is its caption. So the page is a single editorial spread —
 * the current work on the left, its title, category, description and the real
 * shooting facts on the right — with a thumbnail rail to move between works and a
 * Lightbox for the full-size view. There is no feed, no likes, no favourites and
 * no ranking; a portfolio is browsed, not reacted to.
 *
 * TWO CATEGORIES, HONESTLY.
 * 风光 (landscape) and 人像 (portrait) are the two real categories. A record with
 * any other category value is kept as 未分类 and still appears under 全部, so no
 * work is silently dropped. A category with no works shows a real empty state,
 * never a blank page.
 *
 * Everything is driven by src/content/data/photography.json (via the CMS); the
 * page hard-codes no titles, paths or shooting data. Optional facts are rendered
 * only when present — a sample image never grows invented location or EXIF text.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, isCoverPhoto, PHOTOS, PHOTO_CATEGORY_LABELS, SETTINGS } from '@/content';
import type { PhotoCategory } from '@/content/types';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { playSfx } from '@/store/useSoundStore';
import { Lightbox } from './Lightbox';
import './photography.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'photography')!;

type Filter = 'all' | PhotoCategory;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'landscape', label: '风光' },
  { value: 'portrait', label: '人像' },
];

export default function PhotographyPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: PHOTOS[0]?.src ?? SETTINGS.ogImage,
    path: route.path,
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(-1);

  /*
   * Cover photographs lead. The gallery used to open on whatever had been imported
   * first, which was a run of portraits — the visitor asked "why is it portraits
   * again?" twice. `feature` is the field the CMS already exposes for exactly this
   * ("用大幅头图排版"), so honouring it here makes the flag meaningful instead of
   * decorative.
   *
   * The sort is stable, so everything else keeps its existing order behind the covers.
   */
  const visible = useMemo(() => {
    const pool = filter === 'all' ? PHOTOS : PHOTOS.filter((p) => p.category === filter);
    const anyFlagged = PHOTOS.some((p) => p.feature === true);
    return [...pool].sort(
      (a, b) => Number(isCoverPhoto(b, anyFlagged)) - Number(isCoverPhoto(a, anyFlagged))
    );
  }, [filter]);

  /* Keep the selection inside the filtered list — otherwise switching category
     would leave the viewer pointing at a work that is no longer shown. */
  useEffect(() => {
    setIndex((i) => (visible.length === 0 ? 0 : Math.min(i, visible.length - 1)));
  }, [visible]);

  const current = visible[index] ?? null;

  const go = useCallback(
    (delta: number) => {
      if (visible.length < 2) return;
      setIndex((i) => (i + delta + visible.length) % visible.length);
    },
    [visible.length]
  );

  /* Keyboard browsing: left/right move between works. Escape belongs to the
     Lightbox, so the page leaves it alone. Text fields and open modals win. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as Element | null;
      if (el && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const choose = useCallback((next: Filter) => {
    setFilter(next);
    setIndex(0);
  }, []);

  const hasSample = PHOTOS.some((p) => p.provenance === 'sample');

  return (
    <SceneLayout route={route} bodyClassName="photography">
      <header className="ph__head">
        <p className="ph__eyebrow u-label">
          <span className="ph__eyebrow-mark">{BRAND.brandFull}</span>
          <span className="ph__eyebrow-sep" aria-hidden="true">
            ·
          </span>
          {route.labelEn}
        </p>
        <h1 className="ph__title">{route.label}</h1>
        <p className="ph__lede">{route.description}</p>
      </header>

      {hasSample ? (
        <GlassSurface tier="standard" className="ph__notice" radius="var(--r-lg)">
          <Icon name="sparkle" size={16} />
          <div>
            <p className="ph__notice-title">示例图像，不是真实作品</p>
            <p className="ph__notice-body">
              当前显示的是程序生成的抽象光景，用来跑通分类浏览、大图查看与信息排版。
              它们没有任何真实的拍摄地点、设备或参数——我不会替照片编造这些。替换方法见
              <code>docs/CONTENT.md</code>。
            </p>
          </div>
        </GlassSurface>
      ) : null}

      <div className="ph__tabs" role="group" aria-label="按分类浏览作品">
        {FILTERS.map((f) => {
          const count =
            f.value === 'all' ? PHOTOS.length : PHOTOS.filter((p) => p.category === f.value).length;
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              className="ph__tab"
              aria-pressed={active}
              data-active={active || undefined}
              onClick={() => choose(f.value)}
            >
              <span>{f.label}</span>
              <span className="ph__tab-count u-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {current ? (
        <div className="ph__viewer">
          <figure className="ph__stage">
            <button
              type="button"
              className="ph__stage-button"
              onClick={() => {
                playSfx('open');
                setLightbox(index);
              }}
              aria-label={`查看《${current.title}》大图`}
            >
              <SmartImage
                src={current.src}
                thumb={current.thumb}
                alt={current.description ? `${current.title} — ${current.description}` : current.title}
                width={current.width}
                height={current.height}
                tone={current.tone}
                fit="contain"
                sizes="(max-width: 900px) 92vw, 62vw"
                className="ph__image"
                failureLabel="作品文件未加载"
                priority
              />
              <span className="ph__zoom" aria-hidden="true">
                <Icon name="expand" size={16} />
              </span>
            </button>

            {visible.length > 1 ? (
              <figcaption className="ph__nav">
                <button type="button" className="ph__nav-btn" onClick={() => go(-1)} aria-label="上一件作品">
                  <Icon name="arrow-left" size={16} />
                </button>
                <span className="ph__counter u-mono">
                  {String(index + 1).padStart(2, '0')} / {String(visible.length).padStart(2, '0')}
                </span>
                <button type="button" className="ph__nav-btn" onClick={() => go(1)} aria-label="下一件作品">
                  <Icon name="arrow-right" size={16} />
                </button>
              </figcaption>
            ) : null}
          </figure>

          <div className="ph__meta" aria-live="polite">
            <p className="ph__meta-index u-label">作品 {String(index + 1).padStart(2, '0')}</p>
            <h2 className="ph__meta-title">{current.title}</h2>
            <div className="ph__meta-row">
              <span className="badge">{PHOTO_CATEGORY_LABELS[current.category]}</span>
              <ProvenanceBadge provenance={current.provenance} />
            </div>

            {current.description ? <p className="ph__meta-desc">{current.description}</p> : null}

            <dl className="ph__facts">
              {current.takenAt ? (
                <div>
                  <dt className="u-label">拍摄时间</dt>
                  <dd>{current.takenAt}</dd>
                </div>
              ) : null}
              {current.location ? (
                <div>
                  <dt className="u-label">地点</dt>
                  <dd>{current.location}</dd>
                </div>
              ) : null}
              {current.camera ? (
                <div>
                  <dt className="u-label">相机</dt>
                  <dd>{current.camera}</dd>
                </div>
              ) : null}
              {current.lens ? (
                <div>
                  <dt className="u-label">镜头</dt>
                  <dd>{current.lens}</dd>
                </div>
              ) : null}
              <div>
                <dt className="u-label">尺寸</dt>
                <dd className="u-mono">
                  {current.width} × {current.height}
                </dd>
              </div>
            </dl>

            {current.provenance === 'sample' ? (
              <p className="ph__meta-note">
                示例图像：没有拍摄地点、设备或 EXIF 一类信息可展示。这些不是缺失，而是它们本来就不存在。
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <GlassSurface tier="standard" className="ph__empty" radius="var(--r-lg)">
          <Icon name="sparkle" size={16} />
          <div>
            <p className="ph__empty-title">这个分类还没有作品</p>
            <p className="ph__empty-body">
              风光与人像会在这里分别呈现。当我在后台的「摄影作品」中把作品归入这个分类后，
              它会自动出现在这里——不需要改动源码。
            </p>
          </div>
        </GlassSurface>
      )}

      {visible.length > 1 ? (
        <ul className="ph__rail" aria-label="作品缩略图">
          {visible.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className="ph__rail-btn"
                data-active={i === index || undefined}
                aria-label={`查看《${p.title}》`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
              >
                <SmartImage
                  src={p.thumb ?? p.src}
                  alt=""
                  width={p.width}
                  height={p.height}
                  tone={p.tone}
                  sizes="120px"
                  className="ph__rail-img"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="ph__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>

      <Lightbox
        photos={visible}
        index={lightbox}
        onIndexChange={(n) => {
          setLightbox(n);
          setIndex(n);
        }}
        onClose={() => setLightbox(-1)}
      />
    </SceneLayout>
  );
}