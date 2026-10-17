/**
 * cities.ts — the real city layer's data access.
 *
 * The records come from Natural Earth "Populated Places" (ne_110m), converted to
 * the compact src/features/earth/data/cities.json. Every field is copied from the
 * source: name, English name, Chinese name, coordinates, country and population
 * (POP_MAX). Nothing is invented, and this is explicitly a SMALL global base layer
 * (243 places — mostly capitals and major cities), not the world's full city list.
 */

import raw from './data/cities.json';

export interface City {
  /** Stable id (Natural Earth NE_ID). */
  id: string;
  name: string;
  nameEn: string;
  /** Chinese name when the source supplies one (NAME_ZH). */
  nameZh?: string;
  lat: number;
  lon: number;
  country: string | null;
  countryCode: string | null;
  /** Population (Natural Earth POP_MAX); null when the source has none. */
  pop: number | null;
}

const doc = raw as unknown as { items: City[] };

export const CITIES: City[] = doc.items;

/** Chinese label when present, else the English name. */
export function cityLabel(city: City): string {
  return city.nameZh || city.name;
}

/** True when the city has a distinct English name to show alongside the label. */
export function citySubLabel(city: City): string | null {
  const label = cityLabel(city);
  return city.name && city.name !== label ? city.name : null;
}