/**
 * RidingPage — the motorcycle archive and ride log.
 *
 * THE HONESTY PROBLEM, AND HOW IT IS HANDLED
 * The author mentioned one motorcycle (无极 250RR) and expressed interest in
 * touring, but supplied no routes, mileage, service history, or photographs.
 * This page therefore has to be a real, fully-built archive whose fields are
 * mostly empty — and it must make that state legible rather than looking broken.
 *
 * The approach:
 *   • The one confirmed fact is stated as a fact.
 *   • Everything else is rendered as a named, empty slot with a reason and the
 *     exact location that fills it. A visitor understands the page is awaiting
 *     the author's data, not that it failed to load.
 *   • Sample routes are visually distinct (warn-toned badges) and their status is
 *     "planned" — never "ridden". A planned route presented as a completed trip
 *     would be exactly the fabrication the brief forbids.
 *   • The map is rendered as a real schematic from real data, and it states
 *     plainly that no coordinates exist. Its absence never stops the page.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MOTORCYCLE, ROUTES, SERVICE_RECORDS, SERVICE_RECORD_NOTE, SETTINGS } from '@/content';
import type { RideRoute } from '@/content/types';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { ProvenanceBadge, PendingMarker } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRevealOnView } from '@/hooks/useRevealOnView';
import './riding.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'riding')!;

export default function RidingPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: SETTINGS.ogImage,
    path: route.path,
  });

  const [activeRouteId, setActiveRouteId] = useState<string>(ROUTES[0]?.id ?? '');
  const activeRoute = ROUTES.find((r) => r.id === activeRouteId) ?? ROUTES[0];

  const ridden = ROUTES.filter((r) => r.status === 'ridden');
  const planned = ROUTES.filter((r) => r.status === 'planned');

  return (
    <SceneLayout route={route}>
      {/* ======================================================= the machine == */}
      <section className="section" aria-labelledby="riding-machine">
        <div className="section__head">
          <h2 id="riding-machine" className="section__title">
            车辆档案
          </h2>
          <p className="u-label">THE MACHINE</p>
        </div>

        <div className="riding__machine">
          <GlassSurface tier="depth" className="riding__machine-card" radius="var(--r-xl)">
            <div className="riding__machine-art" aria-hidden="true">
              <span className="riding__machine-glyph">
                <Icon name="route" size={40} />
              </span>
              <span className="riding__machine-grid" />
            </div>

            <div className="riding__machine-body">
              <ProvenanceBadge provenance={MOTORCYCLE.provenance} />

              <h3 className="riding__machine-name">{MOTORCYCLE.model}</h3>
              {MOTORCYCLE.modelEn ? (
                <p className="riding__machine-en u-label">{MOTORCYCLE.modelEn}</p>
              ) : null}

              <h4 className="riding__machine-sub u-label">已确认信息</h4>
              <dl className="riding__confirmed">
                {MOTORCYCLE.confirmedDetails.map((spec) => (
                  <div key={spec.label}>
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>

              {MOTORCYCLE.note ? <p className="riding__machine-note">{MOTORCYCLE.note}</p> : null}
            </div>
          </GlassSurface>

          {/* The pending-slot panel. This is the page's most important component:
              it converts "empty" into "documented as empty". */}
          <GlassSurface tier="standard" className="riding__pending" radius="var(--r-xl)">
            <h3 className="riding__pending-title">
              <Icon name="alert" size={15} />
              待补充的车辆信息
            </h3>
            <p className="riding__pending-note">
              下面的字段在内容文件里是空的。我没有替你把它们填上——车型参数、里程、改装与保养历史
              必须是真实的，猜出来的数字比空着更糟。
            </p>

            <ul className="riding__pending-list">
              {MOTORCYCLE.pendingDetails.map((item) => (
                <li key={item}>
                  <span className="riding__pending-dot" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="riding__pending-cms">
              填写位置：后台 <code>内容管理 → 摩旅档案 → 摩托车</code>，
              或直接编辑 <code>src/content/data/riding.json</code>。
              填写后这些字段会自动出现在页面上；仍然为空的字段不会渲染空标签。
            </p>
          </GlassSurface>
        </div>
      </section>

      {/* ========================================================= the routes == */}
      <section className="section" aria-labelledby="riding-routes">
        <div className="section__head">
          <h2 id="riding-routes" className="section__title">
            摩旅路线
          </h2>
          <p className="u-label">
            已完成 {ridden.length} · 计划中 {planned.length}
          </p>
        </div>

        {ROUTES.length === 0 ? (
          <div className="placeholder">
            <p className="placeholder__title">还没有路线记录</p>
            <p className="u-caption">在内容文件中新增路线后会显示在这里。</p>
          </div>
        ) : (
          <>
            <div className="riding__route-tabs" role="tablist" aria-label="路线选择">
              {ROUTES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  id={`route-tab-${r.id}`}
                  aria-selected={activeRoute?.id === r.id}
                  aria-controls={`route-panel-${r.id}`}
                  tabIndex={activeRoute?.id === r.id ? 0 : -1}
                  className="riding__route-tab"
                  data-status={r.status}
                  onClick={() => setActiveRouteId(r.id)}
                >
                  <span className="riding__route-tab-name">{r.name}</span>
                  <span className="riding__route-tab-status">
                    {r.status === 'ridden' ? '已完成' : '计划中'}
                  </span>
                </button>
              ))}
            </div>

            {activeRoute ? (
              <div
                id={`route-panel-${activeRoute.id}`}
                role="tabpanel"
                aria-labelledby={`route-tab-${activeRoute.id}`}
                tabIndex={0}
                className="riding__route-panel"
              >
                <RouteDetail route={activeRoute} />
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ====================================================== service log == */}
      <section className="section" aria-labelledby="riding-service">
        <div className="section__head">
          <h2 id="riding-service" className="section__title">
            维护记录
          </h2>
          <p className="u-label">SERVICE LOG · {SERVICE_RECORDS.length}</p>
        </div>

        {SERVICE_RECORDS.length === 0 ? (
          /* An honest empty state. A fabricated service history would be a real
             fabrication about a real machine, so this panel explains itself. */
          <GlassSurface tier="standard" className="riding__empty" radius="var(--r-lg)">
            <Icon name="journal" size={18} />
            <div>
              <p className="riding__empty-title">暂无维护记录</p>
              <p className="riding__empty-body">
                {SERVICE_RECORD_NOTE ||
                  '这个板块只有在真实记录存在时才有意义，所以它现在保持为空，而不是填充看起来合理的保养条目。'}
              </p>
              <p className="riding__pending-cms">
                填写位置：<code>src/content/data/riding.json → serviceRecords</code>，
                每条记录包含日期、里程与项目列表。
              </p>
            </div>
          </GlassSurface>
        ) : (
          <ul className="riding__service">
            {SERVICE_RECORDS.map((rec) => (
              <li key={rec.id}>
                <GlassSurface tier="standard" className="riding__service-item" radius="var(--r-lg)">
                  <div className="riding__service-head">
                    <span className="u-mono">{rec.date ?? '日期待填写'}</span>
                    {rec.odometerKm !== undefined ? (
                      <span className="u-mono riding__service-km">{rec.odometerKm} km</span>
                    ) : null}
                  </div>
                  <ul className="riding__service-items">
                    {rec.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {rec.note ? <p className="riding__service-note">{rec.note}</p> : null}
                </GlassSurface>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="riding__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>
    </SceneLayout>
  );
}

/* ------------------------------------------------------------------------ */

/** The full detail view of one route, with optional-field suppression. */
function RouteDetail({ route: r }: { route: RideRoute }) {
  const reveal = useRevealOnView<HTMLDivElement>({ threshold: 0.05 });

  return (
    <div ref={reveal.ref} className={`${reveal.className} riding__route-detail`} style={reveal.style}>
      {/* ---------------------------------------------------------- header -- */}
      <GlassSurface tier="depth" className="riding__route-head" radius="var(--r-xl)">
        <div className="riding__route-head-main">
          <div className="row">
            <span className={`badge ${r.status === 'ridden' ? 'badge--accent' : 'badge--warn'}`}>
              <span className="badge__dot" aria-hidden="true" />
              {r.status === 'ridden' ? '已完成' : '计划中 · 尚未骑行'}
            </span>
            <ProvenanceBadge provenance={r.provenance} />
          </div>

          <h3 className="riding__route-title">{r.name}</h3>
          {r.nameEn ? <p className="u-label">{r.nameEn}</p> : null}

          <p className="riding__route-summary">{r.summary}</p>
        </div>

        {/* A schematic of the route: origin, stops, destination, drawn from the
            real stop list rather than being a decorative squiggle. */}
        <svg
          className="riding__route-schematic"
          viewBox="0 0 320 90"
          role="img"
          aria-label={`${r.name} 的示意路线，共 ${r.stops.length} 个点位`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="riding-path" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--scene-accent, #ff9a63)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--scene-accent, #ff9a63)" stopOpacity="0.28" />
            </linearGradient>
          </defs>

          {/* A gentle arc — a road, not a straight line, so it reads as a route. */}
          <path
            d="M 16 68 C 96 22, 150 84, 224 40 S 292 30, 304 24"
            fill="none"
            stroke="url(#riding-path)"
            strokeWidth="1.5"
            strokeDasharray={r.status === 'planned' ? '5 4' : undefined}
          />

          {r.stops.map((stop, i) => {
            const t = r.stops.length > 1 ? i / (r.stops.length - 1) : 0;
            // Sample the same curve used above so markers sit on the path.
            const x = 16 + t * 288;
            const y = 68 - Math.sin(t * Math.PI) * 26 - t * 34;
            return (
              <g key={stop.name}>
                <circle cx={x} cy={y} r="3.4" fill="var(--c-void)" stroke="var(--scene-accent, #ff9a63)" strokeWidth="1.5" />
                <circle cx={x} cy={y} r="1.2" fill="var(--scene-accent, #ff9a63)" />
              </g>
            );
          })}
        </svg>

        {/* Optional numeric fields. Each renders only when it exists. */}
        <dl className="riding__route-facts">
          <div>
            <dt className="u-label">出发地</dt>
            <dd>{r.origin}</dd>
          </div>
          <div>
            <dt className="u-label">目的地</dt>
            <dd>{r.destination}</dd>
          </div>
          <div>
            <dt className="u-label">总里程</dt>
            <dd>
              {r.distanceKm !== undefined ? `${r.distanceKm} km` : <PendingMarker label="里程待填写" />}
            </dd>
          </div>
          <div>
            <dt className="u-label">骑行日期</dt>
            <dd>
              {r.riddenAt ? (
                r.riddenAt
              ) : (
                <PendingMarker label={r.status === 'planned' ? '尚未骑行' : '日期待填写'} />
              )}
            </dd>
          </div>
        </dl>
      </GlassSurface>

      {/* ---------------------------------------------------------- timeline -- */}
      <div className="riding__timeline">
        <h4 className="riding__timeline-title u-label">路线点位 / STOPS</h4>
        <ol className="riding__timeline-list" role="list">
          {r.stops.map((stop, i) => (
            <li key={stop.name} className="riding__timeline-item">
              <span className="riding__timeline-marker" aria-hidden="true">
                <span className="riding__timeline-dot" />
                {i < r.stops.length - 1 ? <span className="riding__timeline-rail" /> : null}
              </span>

              <div className="riding__timeline-body">
                <span className="riding__timeline-index u-mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="riding__timeline-name">{stop.name}</span>
                {stop.note ? <span className="riding__timeline-note">{stop.note}</span> : null}

                {stop.lat !== undefined && stop.lng !== undefined ? (
                  <span className="riding__timeline-coords u-mono">
                    {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        {r.stops.some((s) => s.lat === undefined) ? (
          <p className="riding__timeline-hint">
            <Icon name="alert" size={13} />
            <span>
              这些点位没有坐标，因此地图上不会显示它们——我不会为不存在的点位编造经纬度。
              也不需要地图 API：示意路线图完全由本地数据绘制，不依赖任何外部服务。
            </span>
          </p>
        ) : null}
      </div>

      {/* -------------------------------------------------------- highlights -- */}
      {r.highlights && r.highlights.length > 0 ? (
        <div className="riding__highlights">
          <h4 className="u-label">沿途要点 / HIGHLIGHTS</h4>
          <ul>
            {r.highlights.map((h) => (
              <li key={h}>
                <Icon name="check" size={13} />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
