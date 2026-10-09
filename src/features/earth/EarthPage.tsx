/**
 * EarthPage — 地球 Online 进度.
 *
 * STRUCTURE
 *   • The globe takes the field. It is the reason the page exists, so the layout
 *     gives it the whole viewport and floats the UI over it rather than putting
 *     the globe inside a content column.
 *   • The header floats over the top-left, the stats over the top-right, and the
 *     region panel slides in from the right. Everything is a glass overlay on the
 *     dark ground, which is the one place the dark theme applies.
 *   • A region LIST is always present, below the fold. This is the accessible
 *     equivalent of the globe: every country is reachable by keyboard and by
 *     screen reader without interacting with a canvas at all, which the brief
 *     requires and which is also what makes the page usable when WebGL fails.
 *
 * GROUND
 * This scene runs on the SITE'S LIGHT GROUND. Darkness is contained to one
 * element — the globe well — because a lit sphere needs an unlit field, but the
 * page around it belongs to the same product as every other route. Declaring the
 * whole route dark (as V3 did) put the region list and credits on a near-black
 * background they were never designed for.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PHOTOS, SETTINGS } from '@/content';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { Icon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useRegionVotes } from '@/hooks/useRegionVotes';
import { useVisualStore } from '@/store/useVisualStore';
import { EarthGlobe } from './EarthGlobe';
import { RegionPanel, type RegionVoteState } from './RegionPanel';
import { GeoIndex, type RegionShape } from './geo-index';
import { regionLabel, regionStats, travelFor, hasChineseLabel } from './regions';
import { subSolarPoint } from './solar';
import countriesTopology from './data/countries-110m.json';
import './earth-page.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'earth')!;

export default function EarthPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: SETTINGS.ogImage,
    path: route.path,
  });

  const { reduced } = usePrefersReducedMotion();
  const glassQuality = useVisualStore((s) => s.glassQuality);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  /** Built once. ~40 ms, and it is what makes region lookup per-frame cheap. */
  const geoIndex = useMemo(() => {
    try {
      return GeoIndex.build(countriesTopology as never);
    } catch (e) {
      console.error('[earth] geo index build failed:', e);
      return null;
    }
  }, []);

  /**
   * The solar readout ticks once a minute. The globe itself does not need this —
   * it computes its own sun direction on mount — but the header's terminator note
   * should not go stale while the page is open.
   */
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const sun = useMemo(() => subSolarPoint(now), [now]);

  const selected: RegionShape | null = useMemo(
    () => (selectedId && geoIndex ? geoIndex.lookupById(selectedId) ?? null : null),
    [selectedId, geoIndex]
  );

  const stats = useMemo(
    () => regionStats(geoIndex?.size ?? 0),
    [geoIndex]
  );

  /** Photo lookup for a visited region's panel. */
  const photosById = useMemo(() => {
    const m = new Map<string, { src: string; thumb?: string; title: string; width: number; height: number; tone: string }>();
    for (const p of PHOTOS) {
      m.set(p.id, { src: p.src, thumb: p.thumb, title: p.title, width: p.width, height: p.height, tone: p.tone });
    }
    return m;
  }, []);

  /**
   * The countries list, sorted so the ones with a Chinese label come first.
   *
   * That ordering is a small honesty decision: a Chinese-language page that leads
   * with "Argentina, Armenia, Australia" and buries 中国 somewhere in the middle
   * reads as a translation failure. Leading with the labelled set makes it
   * obvious the list is curated, and the English names that follow are visibly
   * English rather than wrongly-Chinese.
   */
  const listRegions = useMemo(() => {
    if (!geoIndex) return [];
    const all = [...geoIndex.regions];
    all.sort((a, b) => {
      const aZh = hasChineseLabel(a.id) ? 0 : 1;
      const bZh = hasChineseLabel(b.id) ? 0 : 1;
      if (aZh !== bZh) return aZh - bZh;
      // Within each group, surfaces the author's records first — those are the
      // entries a visitor is most likely to want.
      const aT = travelFor(a.id).status === 'unrecorded' ? 1 : 0;
      const bT = travelFor(b.id).status === 'unrecorded' ? 1 : 0;
      if (aT !== bT) return aT - bT;
      return regionLabel(a.id, a.nameEn).localeCompare(regionLabel(b.id, b.nameEn), 'zh-Hans-CN');
    });
    return all;
  }, [geoIndex]);

  /**
   * Vote state covers the recorded regions plus whichever one is open. Asking for
   * all 177 on mount would be a wasted round trip; asking only for the open one
   * would re-subscribe on every click.
   */
  const votableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of listRegions) {
      if (travelFor(r.id).status !== 'unrecorded') ids.add(r.id);
    }
    if (selectedId) ids.add(selectedId);
    return [...ids];
  }, [listRegions, selectedId]);

  const regionVotes = useRegionVotes(votableIds);

  /**
   * Adapt the hook's shape to what the panel renders.
   *
   * Returns null ONLY for the true "no backend" case, which is what makes the
   * panel switch to its explicit unavailable state. A region that has simply not
   * been voted on yet still gets an object, with count read from the backend —
   * including a genuine 0, which is different from "not read".
   */
  const voteForSelected: RegionVoteState | null = useMemo(() => {
    if (!selected) return null;
    if (regionVotes.status === 'unconfigured') return null;

    const entry = regionVotes.counts[selected.id];
    return {
      count: entry?.count ?? null,
      voted: regionVotes.hasVoted(selected.id),
      pending: false,
      error: regionVotes.status === 'error' ? (regionVotes.error ?? '读取投票失败') : null,
      demo: regionVotes.isDemo,
    };
  }, [selected, regionVotes]);

  const onVote = useCallback(() => {
    if (!selected) return;
    void regionVotes.vote(selected.id);
  }, [selected, regionVotes]);

  const closePanel = useCallback(() => setSelectedId(null), []);

  return (
    <div className="scene epage" data-scene="earth">
      <a className="skip-link" href="#earth-list">
        跳到地区列表 <span className="skip-link__en">Skip to region list</span>
      </a>

      {/* ============================================================ globe == */}
      <div className="epage__stage shared-hero">
        <EarthGlobe
          onSelectRegion={(id) => setSelectedId((cur) => (cur === id ? null : id))}
          quality={reduced ? 'balanced' : glassQuality === 'balanced' ? 'balanced' : glassQuality === 'off' ? 'off' : 'high'}
        />

        {/* --------------------------------------------------------- chrome -- */}
        <header className="epage__chrome">
          <div className="epage__chrome-left">
            <Link to="/" className="epage__back">
              <Icon name="arrow-left" size={15} />
              <span>主空间</span>
            </Link>
            <div className="epage__titles">
              <h1 className="epage__title">{route.label}</h1>
              <p className="epage__sub u-label">{route.labelEn}</p>
            </div>
          </div>

          {/* ------------------------------------------------------- stats -- */}
          <dl className="epage__stats" aria-label="旅行进度">
            <div>
              <dt className="u-label">已到访</dt>
              <dd>{stats.visited}</dd>
            </div>
            <div>
              <dt className="u-label">计划中</dt>
              <dd>{stats.planned}</dd>
            </div>
            <div>
              <dt className="u-label">可识别国家与地区</dt>
              <dd>{stats.total}</dd>
            </div>
          </dl>
        </header>

        {/* -------------------------------------------------------- sun note -- */}
        <div className="epage__sun" role="note">
          <span className="epage__sun-dot" aria-hidden="true" />
          <div>
            <p className="epage__sun-line">
              太阳直射点 <span className="u-mono">{sun.latitude.toFixed(1)}°, {sun.longitude.toFixed(1)}°</span>
            </p>
            <p className="epage__sun-note">
              昼夜分界由本地按当前 UTC 时间与太阳赤纬计算，不是装饰性的扫光。
              地表影像本身是静态贴图，不是实时卫星画面。
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------ region panel -- */}
        {selected ? (
          <RegionPanel
            region={selected}
            label={regionLabel(selected.id, selected.nameEn)}
            photosById={photosById}
            vote={voteForSelected}
            onVote={onVote}
            onClose={closePanel}
          />
        ) : null}
      </div>

      {/* ===================================================== region list == */}
      <section className="epage__list-section" id="earth-list" aria-labelledby="earth-list-label">
        <div className="epage__list-head">
          <h2 id="earth-list-label" className="epage__list-title">
            地区列表
          </h2>
          <p className="epage__list-note">
            地球上的每个国家与地区在这里都能用键盘到达。带中文名的排在前面，
            其余使用数据源中的英文名称——没有经过机器翻译，因为一个错误的中文名比一个正确的英文名更糟。
          </p>
        </div>

        {listRegions.length === 0 ? (
          <p className="epage__list-empty">
            国界数据未能加载，因此列表为空。地球仍然可以旋转与缩放。
          </p>
        ) : (
          <ul className="epage__list">
            {listRegions.map((region) => {
              const travel = travelFor(region.id);
              return (
                <li key={region.id}>
                  <button
                    type="button"
                    className="epage__list-item"
                    data-status={travel.status}
                    aria-pressed={selectedId === region.id}
                    onClick={() => {
                      setSelectedId(region.id);
                      // Move focus to the list heading region so a keyboard user
                      // lands somewhere sensible rather than at the document top.
                      document.getElementById('earth-list')?.scrollIntoView({
                        behavior: reduced ? 'auto' : 'smooth',
                        block: 'start',
                      });
                    }}
                  >
                    <span className="epage__list-status" aria-hidden="true" />
                    <span className="epage__list-name">{regionLabel(region.id, region.nameEn)}</span>
                    <span className="epage__list-name-en">{region.nameEn}</span>
                    <span className="epage__list-tag">
                      {travel.status === 'visited'
                        ? '已到访'
                        : travel.status === 'planned'
                          ? '计划中'
                          : '尚未记录'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ======================================================= credits == */}
      <footer className="epage__credits">
        <h2 className="epage__credits-title u-label">数据与素材来源</h2>
        <ul>
          <li>
            地表与海洋：NASA / Goddard Space Flight Center 的合成影像，经 Wikimedia Commons
            分发，**公有领域**。
          </li>
          <li>
            夜间城市灯光：NASA GSFC / NOAA NGDC 的 DMSP 1994–1995 合成图，**公有领域**。
            这是真实观测，但已距今约三十年，不代表当下的灯光分布。
          </li>
          <li>云层：three.js 示例素材（MIT）。这是渲染纹理，不是某一天的真实云图。</li>
          <li>
            国界：Natural Earth 1:110m（公有领域）。该精度下小岛屿与部分边界会被简化或缺失。
          </li>
          <li>
            昼夜与太阳位置：本地按低精度太阳位置算法计算，误差小于 1°。
            这是真实的天文位置，但不是精密星历，也不包含大气折射。
          </li>
        </ul>
        <p className="epage__credits-note">
          完整来源、许可与体积记录在 <code>public/assets/earth/textures.json</code>。
        </p>
      </footer>

      {/* A final, conventional way back. */}
      <div className="epage__footer-nav">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
        <Link to="/photography" className="btn btn--ghost btn--md">
          <span>去看摄影</span>
          <SmartImage
            src={PHOTOS[0]?.thumb ?? PHOTOS[0]?.src ?? ''}
            alt=""
            width={24}
            height={16}
            tone={PHOTOS[0]?.tone ?? '#101820'}
            className="epage__footer-thumb"
            failureLabel=""
          />
        </Link>
      </div>
    </div>
  );
}
