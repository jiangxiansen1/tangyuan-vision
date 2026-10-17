/**
 * travel-markers.ts — the one place that turns travel records into globe markers.
 *
 * Extracted so the home earth scene and the full /earth page cannot disagree
 * about where a recorded place sits. A marker needs REAL coordinates: either the
 * record's own latitude/longitude, or the region's Natural Earth centre. A record
 * with neither produces no marker — nothing is invented to fill the gap.
 */

import type { GeoIndex } from './geo-index';
import { regionLabel } from './regions';

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
}

export interface GlobeMarker {
  lon: number;
  lat: number;
  label: string;
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
    const lon = typeof r.longitude === 'number' ? r.longitude : shape?.center.lon;
    const lat = typeof r.latitude === 'number' ? r.latitude : shape?.center.lat;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    out.push({ lon, lat, label: r.title || r.label || (shape ? regionLabel(shape.id, shape.nameEn) : r.regionId) });
  }
  return out;
}
