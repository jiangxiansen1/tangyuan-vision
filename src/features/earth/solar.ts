/**
 * solar.ts — where the sun is, right now.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * This computes the sub-solar point — the latitude and longitude where the sun is
 * directly overhead — from the current UTC time. It is a real astronomical
 * calculation, using the standard low-precision solar position algorithm (the one
 * in the Astronomical Almanac, accurate to roughly 0.01° for this purpose).
 *
 * It is NOT a full ephemeris and it deliberately omits:
 *   • the equation of time's higher-order terms (kept: the dominant term)
 *   • nutation and aberration
 *   • atmospheric refraction
 *   • the difference between mean and apparent solar time
 *
 * The resulting error is well under a degree, which is far below what is visible
 * on a globe this size — but the UI must still describe the terminator as
 * computed from a real solar position rather than as a precision ephemeris.
 *
 * WHY COMPUTE IT AT ALL
 * A decorative sun that sweeps around on a timer would put the lit side over a
 * randomly chosen part of the world. Computing it means that when the visitor
 * looks at the globe at 3pm local time, the part of Earth that is genuinely in
 * daylight is the part that is lit.
 */

export interface SubSolarPoint {
  /** Degrees north, -23.44..+23.44. */
  latitude: number;
  /** Degrees east, -180..180. */
  longitude: number;
  /** The same point as a normalised 3D direction in the globe's local frame. */
  direction: [number, number, number];
}

const DEG = Math.PI / 180;

/**
 * Sub-solar point for a given instant.
 *
 * The algorithm:
 *   1. Julian day from the Unix epoch.
 *   2. Solar mean anomaly and the equation of centre → true longitude.
 *   3. Declination from the obliquity and the true longitude.
 *   4. Greenwich hour angle from UTC, corrected by the equation of time.
 */
export function subSolarPoint(date: Date = new Date()): SubSolarPoint {
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const n = julianDay - 2451545.0; // days since J2000.0

  // Mean longitude of the sun, degrees.
  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  // Mean anomaly, degrees.
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * DEG;
  // Ecliptic longitude, degrees — the 1.915/0.020 terms are the equation of
  // centre, which is what makes the sun's apparent motion non-uniform.
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;

  // Obliquity of the ecliptic. Slightly time-varying in reality; the J2000 value
  // is within 0.003° of today's, which is irrelevant at this scale.
  const obliquity = 23.4393 * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)) / DEG;

  // Right ascension, needed for the equation of time.
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)) / DEG;

  // Equation of time in degrees: the difference between mean solar longitude and
  // true right ascension. Without this the sub-solar longitude drifts by up to
  // about 4° (16 minutes) through the year.
  let equationOfTime = meanLongitude - rightAscension;
  // Normalise into -180..180 so the wrap at 0/360 does not produce a jump.
  equationOfTime = ((((equationOfTime + 180) % 360) + 360) % 360) - 180;

  // UTC hours as a fraction of a day.
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // Longitude: the sun is overhead at 0° at 12:00 UTC, and moves west.
  let longitude = -15 * (utcHours - 12) - equationOfTime;
  longitude = ((((longitude + 180) % 360) + 360) % 360) - 180;

  return {
    latitude: declination,
    longitude,
    direction: latLonToDirection(declination, longitude),
  };
}

/**
 * Convert a geographic coordinate to a unit direction in the globe's local frame.
 *
 * This convention must match the texture mapping exactly, or the lit side will be
 * offset from the visible continents. For a standard equirectangular Earth map on
 * a SphereGeometry:
 *
 *   u = 0 at longitude -180, u = 1 at +180
 *   v = 1 at the north pole,  v = 0 at the south pole
 *
 * which yields:
 *   x = -sin(lon) * cos(lat)   (negative so that increasing longitude moves east
 *                               across the front face rather than mirroring it)
 *   y =  sin(lat)
 *   z = -cos(lon) * cos(lat)
 *
 * Verified against the rendered globe by checking that at 12:00 UTC the sun is
 * over the prime meridian and Africa is lit — see docs/TESTING.md.
 */
export function latLonToDirection(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [
    -Math.sin(lon) * Math.cos(lat),
    Math.sin(lat),
    -Math.cos(lon) * Math.cos(lat),
  ];
}

/** Inverse of latLonToDirection — used to turn a raycast hit back into a position. */
export function directionToLatLon(x: number, y: number, z: number): { latitude: number; longitude: number } {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  const latitude = Math.asin(Math.max(-1, Math.min(1, ny))) / DEG;
  const longitude = Math.atan2(-nx, -nz) / DEG;
  return { latitude, longitude };
}

/**
 * Whether a given place is currently in daylight, using the same solar model.
 * Used by the region panel so a region's local time and day/night state agree
 * with what the globe is drawing.
 */
export function isDaylight(latDeg: number, lonDeg: number, date: Date = new Date()): boolean {
  const sun = subSolarPoint(date);
  const d = latLonToDirection(latDeg, lonDeg);
  const s = sun.direction;
  return d[0] * s[0] + d[1] * s[1] + d[2] * s[2] > 0;
}

/** Local civil time for a longitude, as an approximation (no timezone database). */
export function approximateLocalTime(lonDeg: number, date: Date = new Date()): string {
  // 15° of longitude per hour, offset from UTC. This is mean solar time, not the
  // political time zone — labelled as approximate wherever it is displayed,
  // because a country's actual offset can differ by hours from its longitude.
  const offsetHours = Math.round(lonDeg / 15);
  const local = new Date(date.getTime() + offsetHours * 3600 * 1000);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  const sign = offsetHours >= 0 ? '+' : '-';
  return `${hh}:${mm} (UTC${sign}${Math.abs(offsetHours)})`;
}
