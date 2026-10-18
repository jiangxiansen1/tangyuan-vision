/**
 * RegionPanel — what you see after clicking a country.
 *
 * THE RULE THIS COMPONENT EXISTS TO ENFORCE
 * There are three completely different things a country on this globe can be, and
 * they must never be blurred together:
 *
 *   VISITED     the author recorded a real trip. Show the record — dates, story,
 *               photos — and nothing that was not supplied.
 *   PLANNED     the author intends to go. Say so.
 *   UNRECORDED  the author has no record. Say THAT, in plain words, and leave it
 *               at that — the panel records the author’s travels; it is not a
 *               place for visitors to vote, rate or rank destinations.
 *
 * The failure mode being avoided is a country panel that looks equally full for
 * all three, which quietly implies a trip that never happened. So the unrecorded
 * branch leads with the fact rather than with filler prose.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { travelFor } from './regions';
import { provinceCenter } from './admin1-pick';
import type { Admin1Item } from './admin1';
import type { RegionShape } from './geo-index';
import { approximateLocalTime, isDaylight } from './solar';
import './region-panel.css';

export interface RegionPanelProps {
  region: RegionShape;
  /** Chinese label resolved by the caller, so this component does not re-derive it. */
  label: string;
  /** Photography lookup, so a visited region can show its own photos. */
  photosById: Map<string, { src: string; thumb?: string; title: string; width: number; height: number; tone: string }>;
  /** The real Admin-1 province the visitor picked, or null to show the country. */
  province?: Admin1Item | null;
  /** Return from the province to its country panel. */
  onBackToCountry?: () => void;
  onClose: () => void;
}

/** Chinese label for a Natural Earth Admin-1 feature type, when one exists. */
const PROVINCE_TYPE_ZH: Record<string, string> = {
  Province: '省',
  'Autonomous Region': '自治区',
  Municipality: '直辖市',
  'Special Administrative Region': '特别行政区',
  Region: '地区',
  State: '州',
  Territory: '领地',
  District: '区',
  Governorate: '省',
  Prefecture: '地区',
  County: '县',
  Department: '省',
};

/** The most human label the data actually carries; never invented. */
function provinceLabel(p: Admin1Item): string {
  return p.nameZh || p.nameEn || p.name;
}

export function RegionPanel({ region, label, photosById, province = null, onBackToCountry, onClose }: RegionPanelProps) {
  const travel = travelFor(region.id);
  const panelRef = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => new Date());

  /**
   * A once-a-minute clock, for the local-time and daylight readout.
   *
   * Deliberately not per-second: the readout shows HH:MM, and re-rendering a
   * panel with a photo grid every second to change nothing visible would be
   * wasteful. The interval is cleared on unmount.
   */
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /** Escape closes, and focus returns to the globe's keyboard surface. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const daylight = isDaylight(region.center.lat, region.center.lon, now);
  const provCenter = province ? provinceCenter(province) : null;

  const statusMeta = {
    visited: { label: '已到访', tone: 'visited' as const },
    planned: { label: '计划中', tone: 'planned' as const },
    unrecorded: { label: '尚未记录', tone: 'unrecorded' as const },
  }[travel.status];

  const photos = (travel.photoIds ?? [])
    .map((id) => photosById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <aside
      ref={panelRef}
      className="rpanel"
      data-status={travel.status}
      role="dialog"
      aria-modal={false}
      aria-labelledby="rpanel-title"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header className="rpanel__head">
        <div className="rpanel__head-main">
          <p className="rpanel__eyebrow u-label">
            <Icon name="location" size={13} />
            {region.nameEn}
          </p>
          <h2 id="rpanel-title" className="rpanel__title">
            {province ? provinceLabel(province) : label}
          </h2>
        </div>

        <button type="button" className="rpanel__close" onClick={onClose} aria-label="关闭地区详情">
          <Icon name="close" size={16} />
        </button>
      </header>

      {province && provCenter ? (
        <>
          <nav className="rpanel__crumbs" aria-label="层级导航">
            <button type="button" className="rpanel__crumb" onClick={onBackToCountry}>
              <Icon name="arrow-left" size={12} />
              {label}
            </button>
            <span className="rpanel__crumb-sep" aria-hidden="true">
              →
            </span>
            <span className="rpanel__crumb rpanel__crumb--current" aria-current="page">
              {provinceLabel(province)}
            </span>
          </nav>

          <dl className="rpanel__facts">
            <div>
              <dt className="u-label">所属国家</dt>
              <dd>{label}</dd>
            </div>
            <div>
              <dt className="u-label">行政区类型</dt>
              <dd>{PROVINCE_TYPE_ZH[province.type] || province.type}</dd>
            </div>
            {province.iso3166_2 ? (
              <div>
                <dt className="u-label">ISO 3166-2</dt>
                <dd className="u-mono">{province.iso3166_2}</dd>
              </div>
            ) : null}
            <div>
              <dt className="u-label">几何中心纬度</dt>
              <dd className="u-mono">
                {Math.abs(provCenter.lat).toFixed(1)}°{provCenter.lat >= 0 ? 'N' : 'S'}
              </dd>
            </div>
            <div>
              <dt className="u-label">几何中心经度</dt>
              <dd className="u-mono">
                {Math.abs(provCenter.lon).toFixed(1)}°{provCenter.lon >= 0 ? 'E' : 'W'}
              </dd>
            </div>
            <div>
              <dt className="u-label">当地时间</dt>
              <dd className="u-mono">{approximateLocalTime(provCenter.lon, now)}</dd>
            </div>
          </dl>
          <p className="rpanel__fact-note">
            几何中心由该行政区的真实边界推算，不是省会城市；当地时间按经度估算。
          </p>

          <section className="rpanel__section" aria-labelledby="rpanel-province-note">
            <h3 id="rpanel-province-note" className="u-label">
              地理信息
            </h3>
            <p className="rpanel__body">
              这是来自 Natural Earth 的一级行政区几何。选中一个行政区只表示你查看了它的位置，
              不代表作者到访、拍摄或收藏过这里——旅行记录由内容文件单独管理。
            </p>
          </section>
        </>
      ) : (
      <>

      {/* ------------------------------------------------------- status bar -- */}
      <div className="rpanel__status" data-tone={statusMeta.tone}>
        <span className="rpanel__status-dot" aria-hidden="true" />
        <span className="rpanel__status-label">{statusMeta.label}</span>
        {travel.status === 'visited' && travel.visitedAt ? (
          <span className="rpanel__status-date u-mono">{travel.visitedAt}</span>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- the facts -- */}
      <dl className="rpanel__facts">
        <div>
          <dt className="u-label">所在纬度</dt>
          <dd className="u-mono">
            {Math.abs(region.center.lat).toFixed(1)}°{region.center.lat >= 0 ? 'N' : 'S'}
          </dd>
        </div>
        <div>
          <dt className="u-label">所在经度</dt>
          <dd className="u-mono">
            {Math.abs(region.center.lon).toFixed(1)}°{region.center.lon >= 0 ? 'E' : 'W'}
          </dd>
        </div>
        <div>
          <dt className="u-label">当地时间</dt>
          <dd className="u-mono">{approximateLocalTime(region.center.lon, now)}</dd>
        </div>
        <div>
          <dt className="u-label">此刻</dt>
          <dd>{daylight ? '白昼' : '夜间'}</dd>
        </div>
      </dl>
      <p className="rpanel__fact-note">
        当地时间按经度推算，是平均太阳时，不等于该国实际使用的法定时区。
      </p>

      {/* ===================================================== VISITED ==== */}
      {travel.status === 'visited' ? (
        <section className="rpanel__section" aria-labelledby="rpanel-visited">
          <h3 id="rpanel-visited" className="u-label">
            旅行记录
          </h3>

          {travel.title ? <p className="rpanel__entry-title">{travel.title}</p> : null}

          {travel.story ? (
            <div className="rpanel__story u-prose">
              {travel.story.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            <p className="rpanel__missing">这次旅行还没有写下正文。</p>
          )}

          {photos.length > 0 ? (
            <ul className="rpanel__photos">
              {photos.map((photo) => (
                <li key={photo.src}>
                  <img
                    src={photo.src}
                    alt={photo.title}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rpanel__missing">这次旅行还没有关联照片。</p>
          )}

          {travel.latitude !== undefined && travel.longitude !== undefined ? (
            <p className="rpanel__coord u-mono">
              记录坐标 {travel.latitude.toFixed(4)}, {travel.longitude.toFixed(4)}
            </p>
          ) : null}

          {/*
            City-level visits. A country record is one entry, which cannot express
            "twelve cities in Hainan"; this list can. Grouped by province because
            that is how a trip is actually recalled.
          */}
          {travel.places && travel.places.length > 0 ? (
            <section className="rpanel__section" aria-labelledby="rpanel-places">
              <h3 id="rpanel-places" className="u-label">
                到访城市 <span className="rpanel__place-count u-mono">{travel.places.length}</span>
              </h3>
              <ul className="rpanel__places">
                {travel.places.map((place) => (
                  <li key={`${place.province ?? ''}-${place.name}`} className="rpanel__place">
                    <span className="rpanel__place-name">{place.name}</span>
                    {place.province ? (
                      <span className="rpanel__place-province">{place.province}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="rpanel__fact-note">
                城市坐标来自常见地理资料，用于在地球上定位；它们不是 GPS 记录，可能与实际落脚点有偏差。
              </p>
            </section>
          ) : null}
        </section>
      ) : null}

      {/* ===================================================== PLANNED ==== */}
      {travel.status === 'planned' ? (
        <section className="rpanel__section" aria-labelledby="rpanel-planned">
          <h3 id="rpanel-planned" className="u-label">
            计划
          </h3>
          <p className="rpanel__body">
            {travel.story ||
              '这里被标记为「计划中」：有去的打算，但还没有成行。所以下面没有旅行记录——计划不等于经历。'}
          </p>
        </section>
      ) : null}

      {/* ================================================== UNRECORDED ==== */}
      {travel.status === 'unrecorded' ? (
        <section className="rpanel__section" aria-labelledby="rpanel-unrecorded">
          <h3 id="rpanel-unrecorded" className="u-label">
            旅行记录
          </h3>
          <p className="rpanel__body rpanel__body--empty">
            我还没有去过这里，因此这里没有任何旅行记录、日期、路线或照片。
            这个空白是准确的——它不代表我忘了填，而是代表事情还没发生。
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------- provenance note -- */}
      {travel.status !== 'unrecorded' ? (
        <footer className="rpanel__foot">
          <ProvenanceBadge provenance="sample" />
          <p className="rpanel__foot-note">
            这条记录来自内容文件，可以在后台 CMS 的「地球与旅行」中修改。
          </p>
        </footer>
      ) : null}
      </>
      )}
    </aside>
  );
}
