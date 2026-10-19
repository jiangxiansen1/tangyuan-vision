/**
 * EarthScene — scene 02: ONE lightweight Three.js globe, expanded in place.
 *
 * WHY THREE ONLY (P2.5)
 * The scene used to mount MapGlobe — a vector/raster tile stack — for a pane
 * that never needed street or town detail. Every wheel step zoomed deeper and
 * pulled another wave of tiles, which is exactly the lag the review reported.
 * The immersive globe here is the project's own EarthGlobe (natural-colour
 * textures already in /public/assets/earth, cloud shell, atmosphere rim,
 * starfield, region picking via GeoIndex). No tiles are requested at all, so
 * zooming costs nothing extra and the visual keeps its ball silhouette.
 * The /earth route keeps MapGlobe on purpose — that is where real basemap
 * drill-down belongs, and it is documented in docs/design-brief.md.
 *
 * ONE INSTANCE ACROSS EXPAND
 * Expanding is a CSS class: the same canvas grows in place, so the globe is
 * never rebuilt, never re-tessellated and never re-loaded.
 *
 * REAL DATA ONLY
 * Region centres come from Natural Earth via GeoIndex; the focus turn uses the
 * same rotation mapping the globe itself renders with (verified numerically).
 * Travel records (travels.json) still hold zero entries, so the panel shows an
 * honest empty state and no marker is invented.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { TRAVEL_PHOTOS } from '@/content';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useVisualStore } from '@/store/useVisualStore';
import { Icon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { PendingMarker, ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { EarthGlobe, type GlobeControlApi } from '@/features/earth/EarthGlobe';
import { GeoIndex } from '@/features/earth/geo-index';
import { regionLabel, regionStats, travelFor } from '@/features/earth/regions';
import countriesTopology from '@/features/earth/data/countries-110m.json';
import travelData from '@/content/data/travels.json';
import { GestureControl } from '@/features/earth/gesture/GestureControl';
import { readTravelRecords, deriveMarkers } from '@/features/earth/travel-markers';
import { SceneShell } from './SceneShell';

/*
 * EARTH SCENE STATE MACHINE (P4b)
 *
 *   default          idle globe, auto-rotating on the lit hemisphere
 *   expanded         the same WebGL instance in a taller pane (CSS only)
 *   region           a picked region: the globe TURNS to it and the glass
 *                    panel shows its real record, or an honest empty state
 *   region+expanded  both of the above — the panel simply gets more room
 *
 * Transitions
 *   default  --expand------------>  expanded        (instance preserved)
 *   expanded --collapse---------->  default
 *   any      --pick region------->  region          (focus turn + panel)
 *   region   --返回全球 / ESC----->  clear selection + resetView()  →  default
 *   region   --ESC (panel closed)->  collapse
 *
 * Rules that keep it honest: collapsing does NOT discard the selection (the
 * pane is the frame, the region is the content); returning to global restores
 * the opening view through the globe's own resetView(), so auto-rotation
 * resumes and the camera is not left parked over the chosen country.
 * ESC is guarded: a modal dialog or a text field keeps its own Escape.
 */

const STATUS_LABEL: Record<string, string> = {
  visited: '已到访',
  planned: '计划中',
  unrecorded: '尚未记录',
};

export function EarthScene() {
  const route = NAVIGABLE_ROUTES.find((r) => r.id === 'earth')!;
  const { reduced } = usePrefersReducedMotion();
  const { glassQuality } = useVisualStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  /** Bumped to ask the globe for its opening view (see resetSignal). */
  const [resetSignal, setResetSignal] = useState(0);
  /** Gesture driver → globe control channel (no React state per frame). */
  const globeControl = useRef<GlobeControlApi | null>(null);

  const geoIndex = useMemo(() => {
    try {
      return GeoIndex.build(countriesTopology as never);
    } catch {
      return null;
    }
  }, []);
  const stats = useMemo(() => regionStats(geoIndex?.size ?? 0), [geoIndex]);

  const selected = useMemo(
    () => (selectedId && geoIndex ? geoIndex.lookupById(selectedId) ?? null : null),
    [selectedId, geoIndex]
  );
  const travel = useMemo(() => (selected ? travelFor(selected.id) : null), [selected]);

  const records = useMemo(() => readTravelRecords(travelData), []);

  /** Markers: a recorded place with real coordinates, or a recorded region's
      real Natural Earth centre. Zero records today means zero markers. */
  const markers = useMemo(() => deriveMarkers(records, geoIndex), [records, geoIndex]);

  const photos = useMemo(() => {
    const ids = travel?.photoIds ?? [];
    return ids
      .map((id) => TRAVEL_PHOTOS.find((p) => p.id === id))
      .filter((p): p is (typeof TRAVEL_PHOTOS)[number] => Boolean(p));
  }, [travel]);

  const focus = useMemo(
    () => (selected ? { lon: selected.center.lon, lat: selected.center.lat, distance: expanded ? 0.74 : 0.88 } : null),
    [selected, expanded]
  );

  /** Stable identity: a new callback per render would be pure churn — see
      the measured note inside EarthGlobe about effect dependencies. */
  const handleSelectRegion = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  /** 返回全球: clear the selection AND restore the opening view/auto-rotation. */
  const returnToGlobal = useCallback(() => {
    setSelectedId(null);
    setResetSignal((n) => n + 1);
  }, []);

  /* ESC closes the panel first; with the panel already closed it collapses the
     pane. Guarded against modals (settings dialog) and text fields, and it does
     nothing when there is nothing to close — so the App-level Escape chain for
     the switcher/settings is never shadowed. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as Element | null;
      if (el && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (selectedId) {
        e.preventDefault();
        returnToGlobal();
        return;
      }
      if (expanded) {
        e.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, expanded, returnToGlobal]);

  const quality = reduced
    ? 'balanced'
    : glassQuality === 'off'
      ? 'off'
      : glassQuality === 'balanced'
        ? 'balanced'
        : 'high';

  return (
    <SceneShell
      route={route}
      index="02"
      variant="split"
      lede="一颗真实渲染的地球：自然色陆海、云层与大气边缘，昼夜分界由本地太阳位置计算。拖拽旋转，点选国家或地区。"
      headExtra={
        <>
          <dl className="vscene__stats" aria-label="旅行进度">
            <div>
              <dt className="u-label">已到访</dt>
              <dd className="u-mono">{stats.visited}</dd>
            </div>
            <div>
              <dt className="u-label">计划中</dt>
              <dd className="u-mono">{stats.planned}</dd>
            </div>
            <div>
              <dt className="u-label">可识别</dt>
              <dd className="u-mono">{stats.total}</dd>
            </div>
          </dl>
          <GestureControl control={globeControl} />
        </>
      }
      ctas={[{ to: '/earth', label: '进入完整地球', en: 'EARTH ONLINE', primary: true }]}
    >
      <div
        className={"vscene__globe escene__stage glass glass--depth" + (expanded ? ' is-expanded' : '')}
        /* Observable state for tests and the rail: default / expanded / region / region-expanded. */
        data-earth-state={selectedId ? (expanded ? 'region-expanded' : 'region') : expanded ? 'expanded' : 'default'}
      >
        <EarthGlobe
          preview
          quality={quality}
          focus={focus}
          markers={markers}
          onSelectRegion={handleSelectRegion}
          resetSignal={resetSignal}
          controlRef={globeControl}
        />

        <div className="escene__chrome">
          <span className="escene__hint u-mono">
            {selected ? '已聚焦该地区 — 右侧面板显示记录' : '拖拽旋转 · 点击国家或地区 · 滚轮切换场景'}
          </span>
          <button
            type="button"
            className="escene__expand glass glass--standard"
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <Icon name={expanded ? 'arrow-left' : 'arrow-right'} size={13} />
            <span>{expanded ? '收起地球' : '展开地球'}</span>
          </button>
        </div>

        {selected ? (
          <aside className="escene__panel glass glass--solid" aria-label="地区记录">
            <header className="escene__panel-head">
              <h3 className="escene__panel-title">{travel?.label || regionLabel(selected.id, selected.nameEn)}</h3>
              <span className={"escene__status escene__status--" + (travel?.status ?? 'unrecorded')}>
                {STATUS_LABEL[travel?.status ?? 'unrecorded'] ?? '尚未记录'}
              </span>
            </header>

            {travel?.title ? <p className="escene__panel-sub">{travel.title}</p> : null}
            {travel?.visitedAt ? <p className="escene__panel-sub">时间：{travel.visitedAt}</p> : null}
            {travel?.story ? (
              <p className="escene__panel-story">{travel.story}</p>
            ) : (
              <p className="escene__panel-story escene__panel-story--empty">
                这个地区还没有旅行记录。故事与照片会在录入之后出现在这里——在此之前不写占位文字。
              </p>
            )}

            {photos.length > 0 ? (
              <ul className="escene__photos">
                {photos.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <SmartImage
                      src={p.thumb ?? p.src}
                      alt={p.title}
                      width={p.width}
                      height={p.height}
                      tone={p.tone}
                      sizes="120px"
                    />
                    <ProvenanceBadge provenance={p.provenance} compact />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="escene__panel-note">
                <PendingMarker label="尚无照片" />
              </p>
            )}

            <div className="escene__panel-actions">
              <Link to="/earth" className="vscene__cta glass glass--standard">
                <span>进入完整地球</span>
                <span className="vscene__cta-en u-mono">EARTH</span>
              </Link>
              <button type="button" className="escene__close" onClick={returnToGlobal}>
                返回全球
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </SceneShell>
  );
}
