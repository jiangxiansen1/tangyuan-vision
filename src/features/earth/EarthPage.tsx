/**
 * EarthPage — /earth: the full immersive globe, and nothing else.
 *
 * WHAT CHANGED AND WHY
 * This page used to render MapGlobe (MapLibre vector + NASA raster tiles) as its
 * main surface, with a "数据与素材来源" list underneath. The visitor asked for a
 * pure three-dimensional globe, and the home scene had already proved that the
 * project's own EarthGlobe (natural-colour textures in /public/assets/earth,
 * cloud shell, atmosphere rim, starfield, GeoIndex picking) is the better
 * immersive surface. So /earth now mounts ONE EarthGlobe:
 *
 *   • no MapLibre, therefore no tile requests at all on this route;
 *   • no map-source list — the textures are the project's own public-domain NASA
 *     set and Natural Earth, credited in a single compact line instead;
 *   • the gesture control is the SHARED session (gestureSession), so a session
 *     started on the home scene keeps running when the visitor arrives here;
 *   • region picking, real travel markers, the region panel and the honest empty
 *     states are all preserved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PHOTOS } from '@/content';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { Icon } from '@/components/ui/Icon';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useVisualStore } from '@/store/useVisualStore';
import { EarthGlobe, type GlobeControlApi } from './EarthGlobe';
import { GeoIndex } from './geo-index';
import { regionLabel, regionStats } from './regions';
import { RegionPanel } from './RegionPanel';
import { Lightbox } from '@/features/photography/Lightbox';
import { pickProvince } from './admin1-pick';
import { GestureHud } from './gesture/GestureHud';
import { Reticle } from './gesture/Reticle';
import { loadAdmin1ForCountry, type Admin1Item } from './admin1';
import { readTravelRecords, deriveMarkers } from './travel-markers';
import { CITIES, cityLabel, citySubLabel, type City } from './cities';
import countriesTopology from './data/countries-110m.json';
import travelData from '@/content/data/travels.json';
import './earth-pure.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'earth')!;

export default function EarthPage() {
  useDocumentTitle({ title: route.title, description: route.description, path: '/earth' });

  const { reduced } = usePrefersReducedMotion();
  const glassQuality = useVisualStore((s) => s.glassQuality);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The real city marker the visitor activated, if any. */
  const [city, setCity] = useState<City | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const globeControl = useRef<GlobeControlApi | null>(null);

  const geoIndex = useMemo(() => {
    try {
      return GeoIndex.build(countriesTopology as never);
    } catch {
      return null;
    }
  }, []);
  const stats = useMemo(() => regionStats(geoIndex?.size ?? 0), [geoIndex]);
  const records = useMemo(() => readTravelRecords(travelData), []);
  /**
   * Provinces that have a recorded city inside them.
   *
   * Derived from the records rather than stored separately, so there is exactly
   * one source of truth: adding a city in the CMS lights its province up on the
   * globe with no further bookkeeping.
   */
  const visitedProvinces = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.status !== 'visited' || r.published === false) continue;
      for (const place of r.places ?? []) {
        if (place.province) set.add(place.province);
      }
    }
    return [...set];
  }, [records]);
  const markers = useMemo(() => deriveMarkers(records, geoIndex), [records, geoIndex]);
  /**
   * Photographs with a real capture coordinate, for the globe's thumbnail layer.
   * Derived from the photography collection, so the globe and the gallery can
   * never disagree about where a shot was taken.
   */
  const photoPins = useMemo(
    () =>
      PHOTOS.filter(
        (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number'
      ).map((p) => ({
        lat: p.latitude as number,
        lon: p.longitude as number,
        thumb: p.thumb ?? p.src,
        title: p.title,
      })),
    []
  );
  const photosById = useMemo(
    () =>
      new Map(
        PHOTOS.map((p) => [
          p.id,
          { src: p.src, thumb: p.thumb, title: p.title, width: p.width, height: p.height, tone: p.tone },
        ])
      ),
    []
  );

  const selected = useMemo(
    () => (selectedId && geoIndex ? geoIndex.lookupById(selectedId) ?? null : null),
    [selectedId, geoIndex]
  );
  const focus = useMemo(
    () => (selected ? { lon: selected.center.lon, lat: selected.center.lat, distance: 0.86 } : null),
    [selected]
  );

  /** The real Admin-1 province the visitor activated, or null (country level). */
  const [selectedProvince, setSelectedProvince] = useState<Admin1Item | null>(null);

  /*
   * Real Admin-1 geometry for the SELECTED country (loaded on demand, cached).
   * The country id travels WITH the geometry so the globe can never test a click
   * on one country against another country's province polygons. Stale geometry is
   * cleared the instant the selection changes, so a fast switch cannot pick a
   * province from the country that was selected a moment ago.
   */
  const [admin1, setAdmin1] = useState<{ countryId: string; items: Admin1Item[] } | null>(null);
  /*
   * Read inside the click callback WITHOUT making that callback depend on the
   * geometry: a new callback identity on every load would be churn, and the
   * callback needs the LATEST value at click time, not the one captured when the
   * globe's listeners were bound.
   */
  const admin1Ref = useRef<{ countryId: string; items: Admin1Item[] } | null>(null);
  admin1Ref.current = admin1;

  /*
   * The selected province's photographs, decided by their EXIF coordinates against
   * the province polygons.
   *
   * Not from a per-province id list: photographs carry a real position, the province
   * geometry is already loaded, and one point-in-polygon test per photo is cheaper
   * than maintaining a mapping that goes stale on every import. A photo with no
   * recorded position is left out rather than guessed into a province.
   */
  const provincePhotos = useMemo(() => {
    if (!selectedProvince || !admin1) return null;
    return PHOTOS.filter((photo) => {
      if (typeof photo.latitude !== 'number' || typeof photo.longitude !== 'number') {
        return false;
      }
      const found = pickProvince(admin1.items, photo.longitude, photo.latitude);
      return found?.id === selectedProvince.id;
    });
  }, [selectedProvince, admin1]);

  /*
   * Lightbox state for the province's photographs.
   *
   * Kept on the page rather than inside the panel: the lightbox covers the whole
   * viewport, and the panel is unmounted when the visitor closes the region.
   */
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const closeLightbox = useCallback(() => setLightboxIndex(-1), []);



  /*
   * Which country's provinces are drawn when nothing is selected.
   *
   * Borders used to exist ONLY for the currently selected country, so the globe
   * looked borderless until you clicked something. The visitor's expectation is
   * that a map always shows its administrative divisions. Admin-1 is loaded per
   * country on demand, so the honest default is: draw the provinces of the
   * countries that actually have a travel record. That is a handful of files, it
   * is exactly the region the map is "about", and it needs no click.
   */
  const defaultAdmin1Country = useMemo(() => {
    const visited = records.filter((r) => r.status === 'visited' && r.published !== false && r.regionId);
    return visited.length ? visited[0].regionId! : null;
  }, [records]);

  useEffect(() => {
    const countryId = selectedId ?? defaultAdmin1Country;
    if (!countryId) { setAdmin1(null); return; }
    let alive = true;
    setAdmin1(null);
    void loadAdmin1ForCountry(countryId).then((c) => {
      if (alive) setAdmin1(c ? { countryId, items: c.items } : null);
    });
    return () => { alive = false; };
  }, [selectedId, defaultAdmin1Country]);

  /**
   * A country was clicked.
   *
   * THE TOGGLE IS CONDITIONAL, AND THAT IS THE FIX.
   *
   * Plain toggling (`cur === id ? null : id`) is right for a country with no
   * Admin-1 data: clicking it again is the only way to dismiss its panel.
   *
   * It is wrong for a country that HAS provinces, because the natural way to go
   * deeper is to click the country you are already looking at. That second click
   * used to be read as "close", so the panel vanished exactly when the visitor
   * was trying to drill in — and with the Admin-1 chunk still loading on the
   * first click, drilling in looked impossible. Keeping the selection while
   * province data exists lets the click land as a province pick instead.
   */
  const handleSelectRegion = useCallback((id: string) => {
    setCity(null);
    setSelectedProvince(null);
    setSelectedId((cur) => {
      if (cur !== id) return id;
      // Already selected: keep it open only when this country can show provinces.
      return admin1Ref.current?.countryId === id ? cur : null;
    });
  }, []);

  /**
   * A real Admin-1 province was activated. Its parent country is already the
   * selected country — the globe only offers a province when its loaded geometry
   * matches the hit country — so we set that country WITHOUT toggling it off and
   * record the province. Selecting a province is a geographic query only; it
   * never claims the author visited it (travel records live in the CMS).
   */
  const handleSelectProvince = useCallback((countryId: string, province: Admin1Item) => {
    setCity(null);
    setSelectedId(countryId);
    setSelectedProvince(province);
  }, []);

  const handleSelectCity = useCallback((next: City) => {
    setSelectedId(null);
    setSelectedProvince(null);
    setCity(next);
  }, []);

  const closeCity = useCallback(() => setCity(null), []);

  /* Region id -> label, for the reticle's name readout. */
  const labelOf = useCallback(
    (id: string) => {
      const sh = geoIndex?.lookupById(id);
      return sh ? regionLabel(sh.id, sh.nameEn) : null;
    },
    [geoIndex]
  );

  const returnToGlobal = useCallback(() => {
    setSelectedProvince(null);
    setSelectedId(null);
    setResetSignal((n) => n + 1);
  }, []);

  /* ESC closes the panel first, then returns the view — same semantics as the
     home earth scene, and never stealing Escape from a modal or a text field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as Element | null;
      if (el && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (!selectedId) return;
      e.preventDefault();
      returnToGlobal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, returnToGlobal]);

  const quality = reduced
    ? 'balanced'
    : glassQuality === 'off'
      ? 'off'
      : glassQuality === 'balanced'
        ? 'balanced'
        : 'high';

  return (
    <div className="scene epure" data-scene="earth">
      <div className="epure__globe" data-earth-surface="full">
        <EarthGlobe
          quality={quality}
          focus={focus}
          markers={markers}
          cities={CITIES}
          resetSignal={resetSignal}
          controlRef={globeControl}
          onSelectRegion={handleSelectRegion}
          onSelectCity={handleSelectCity}
          admin1={admin1?.items ?? null}
          admin1Country={admin1?.countryId ?? null}
          onSelectProvince={handleSelectProvince}
          visitedProvinces={visitedProvinces}
          photoPins={photoPins}
        />
        <Reticle labelOf={labelOf} />
      </div>

      <header className="epure__top">
        <Link className="epure__back glass glass--standard" to="/" data-interactive="true">
          <Icon name="arrow-left" size={14} />
          <span>主空间</span>
        </Link>
        <div className="epure__titles">
          <h1 className="epure__title">{route.label}</h1>
          <span className="u-label">{route.labelEn}</span>
        </div>
      </header>

      <div className="epure__bottom">
        <div>
          <GestureHud control={globeControl} />
          <dl className="epure__stats" aria-label="旅行进度">
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
        </div>
        <p className="epure__credit">
          地球影像：NASA Blue Marble / MODIS（公有领域） · 放大后的高清影像：Esri, Maxar,
          Earthstar Geographics, and the GIS User Community · 国界与地区：Natural Earth（公有领域）
        </p>
      </div>

      {city ? (
        <aside className="epure__city glass glass--depth" role="dialog" aria-modal={false} aria-label="城市信息">
          <header className="epure__city-head">
            <div>
              <h2 className="epure__city-title">{cityLabel(city)}</h2>
              {citySubLabel(city) ? <span className="epure__city-sub u-label">{citySubLabel(city)}</span> : null}
            </div>
            <button type="button" className="epure__city-close" onClick={closeCity} aria-label="关闭城市信息">
              <Icon name="close" size={16} />
            </button>
          </header>
          <dl className="epure__city-facts">
            {city.country ? (
              <div>
                <dt className="u-label">国家 / 地区</dt>
                <dd>{city.country}</dd>
              </div>
            ) : null}
            <div>
              <dt className="u-label">坐标</dt>
              <dd className="u-mono">
                {city.lat.toFixed(2)}, {city.lon.toFixed(2)}
              </dd>
            </div>
            {city.pop ? (
              <div>
                <dt className="u-label">人口</dt>
                <dd className="u-mono">{city.pop.toLocaleString('en-US')}</dd>
              </div>
            ) : null}
          </dl>
          <p className="epure__city-note">
            城市坐标与人口来自 Natural Earth（公有领域）。这一版为精简基础层，并不覆盖全球所有城市。
          </p>
        </aside>
      ) : null}

      {selected ? (
        <RegionPanel
          region={selected}
          label={regionLabel(selected.id, selected.nameEn)}
          photosById={photosById}
          provincePhotos={provincePhotos}
          onOpenPhoto={(photoIndex) => setLightboxIndex(photoIndex)}
          province={selectedProvince}
          onBackToCountry={() => setSelectedProvince(null)}
          onClose={returnToGlobal}
        />
      ) : null}

        {provincePhotos && provincePhotos.length > 0 ? (
          <Lightbox
            photos={provincePhotos}
            index={lightboxIndex}
            onIndexChange={setLightboxIndex}
            onClose={closeLightbox}
          />
        ) : null}

      <p className="visually-hidden">
        三维地球。方向键左右旋转、上下缩放，Home 恢复视角，Enter 选中准星所在地区，Esc 关闭地区面板。
      </p>
    </div>
  );
}
