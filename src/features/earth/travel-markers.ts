/**
 * travel-markers.ts — the one place that turns travel records into globe markers.
 *
 * Extracted so the home earth scene and the full /earth page cannot disagree
 * about where a recorded place sits. A marker needs REAL coordinates: either the
 * record's own latitude/longitude, or the region's Natural Earth centre. A record
 * with neither produces no marker — nothing is invented to fill the gap.
 *
 * PLACES (city level)
 * A travel record is keyed by country, so one record per country cannot show that
 * a visitor covered twelve cities inside it. `places` carries those cities with
 * their own coordinates; each one becomes a marker of its own. A place without
 * coordinates is listed in the panel as text but produces no marker, for the same
 * reason as above.
 */

import type { GeoIndex } from './geo-index';
import { regionLabel, type PlaceVisit } from './regions';

/** Re-exported so callers do not need to know which module owns the shape. */
export type TravelPlace = PlaceVisit;

export interface TravelRecordLike {
  regionId?: string;
  status?: string;
  label?: string;
  title?: string;
  story?: string;
  visitedAt?: string;
  photoIds?: string[];
  latitude?: number;
  longitude?: number;
  published?: boolean;
  places?: TravelPlace[];
}

export interface GlobeMarker {
  lon: number;
  lat: number;
  label: string;
  /** Distinguishes a city marker from a country-level one, so the two can be styled differently. */
  kind?: 'region' | 'place';
}

export function readTravelRecords(json: unknown): TravelRecordLike[] {
  const items = (json as { items?: TravelRecordLike[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

export function deriveMarkers(records: readonly TravelRecordLike[], geoIndex: GeoIndex | null): GlobeMarker[] {
  const out: GlobeMarker[] = [];
  for (const r of records) {
    if (!r.regionId) continue;
    if (r.published === false) continue;
    const shape = geoIndex ? geoIndex.lookupById(r.regionId) : undefined;

    /*
     * City-level places do NOT produce globe markers any more.
     *
     * They used to, one dot per city, which put thirty-odd bright points on top
     * of a province fill that already says "visited" — two statements of the same
     * fact, and the dots were the noisier one. Places still drive the province
     * fill and the panel's city list; the globe shows the region, not the pins.
     */
    const places = Array.isArray(r.places) ? r.places : [];
    const hasPlaces = places.length > 0;

    const lon = typeof r.longitude === 'number' ? r.longitude : shape?.center.lon;
    const lat = typeof r.latitude === 'number' ? r.latitude : shape?.center.lat;

    // A record whose detail is already carried by a filled province needs no
    // country-centre dot either: the centre of China is not a place anyone went.
    if (hasPlaces) continue;

    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    out.push({
      lon,
      lat,
      label: r.title || r.label || (shape ? regionLabel(shape.id, shape.nameEn) : r.regionId),
      kind: 'region',
    });
  }
  return out;
}
