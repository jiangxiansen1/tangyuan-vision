/**
 * What is at the centre of the globe view, and is it a country?
 *
 * This reproduces the exact projection the component uses — rotation convention,
 * camera position, ray direction — so the question "would a centre click hit land?"
 * has a numeric answer instead of a guess.
 *
 * It also reports the sub-solar longitude, because the opening view is chosen to
 * face the sun, and at certain times of day that is open ocean.
 */

const DEG = Math.PI / 180;

/** Same mapping as src/features/earth/solar.ts. */
function latLonToDirection(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [-Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat)];
}

/** Inverse, as used on the raycast hit point. */
function directionToLatLon(x, y, z) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  const latitude = Math.asin(Math.max(-1, Math.min(1, y / len))) / DEG;
  const longitude = Math.atan2(-x / len, -z / len) / DEG;
  return { latitude, longitude };
}

/**
 * Reproduce the component's rotation.
 *
 * From EarthGlobe:  HOME_ROTATION = { lon: -90 - sun.longitude, lat: 18 }
 * and applyRotation sets globe.rotation.y = rad(rotation.lon) deg->rad,
 * globe.rotation.x = rad(rotation.lat).
 *
 * three.js applies Euler order 'XYZ' as R = Rx * Ry * Rz.
 */
function rotateLocalToWorld(v, rotYdeg, rotXdeg) {
  const ry = rotYdeg * DEG;
  const rx = rotXdeg * DEG;
  // Ry
  let x = v[0] * Math.cos(ry) + v[2] * Math.sin(ry);
  let y = v[1];
  let z = -v[0] * Math.sin(ry) + v[2] * Math.cos(ry);
  // Rx
  const y2 = y * Math.cos(rx) - z * Math.sin(rx);
  const z2 = y * Math.sin(rx) + z * Math.cos(rx);
  return [x, y2, z2];
}

/** Low-precision sub-solar point, matching solar.ts. */
function subSolarPoint(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const M = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const ecl = (L + 1.915 * Math.sin(M) + 0.02 * Math.sin(2 * M)) * DEG;
  const obl = 23.4393 * DEG;
  const dec = Math.asin(Math.sin(obl) * Math.sin(ecl)) / DEG;
  const ra = Math.atan2(Math.cos(obl) * Math.sin(ecl), Math.cos(ecl)) / DEG;
  let eot = L - ra;
  eot = ((((eot + 180) % 360) + 360) % 360) - 180;
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (utcH - 12) - eot;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { latitude: dec, longitude: lon };
}

const now = new Date();
const sun = subSolarPoint(now);
const rotY = -90 - sun.longitude;
const rotX = 18;

console.log(`  now (UTC)          : ${now.toISOString().slice(0, 19)}`);
console.log(`  sub-solar point    : ${sun.latitude.toFixed(2)}, ${sun.longitude.toFixed(2)}`);
console.log(`  globe rotation     : y=${rotY.toFixed(2)} deg  x=${rotX} deg\n`);

/*
 * Find the geographic point facing the camera.
 *
 * The camera sits at +Z looking at the origin, so the point facing it is whichever
 * geographic position maps to a world direction with the largest +Z component.
 */
let best = { lat: 0, lon: 0, z: -2 };
for (let lat = -80; lat <= 80; lat += 0.5) {
  for (let lon = -180; lon <= 180; lon += 0.5) {
    const d = latLonToDirection(lat, lon);
    const world = rotateLocalToWorld(d, rotY, rotX);
    if (world[2] > best.z) best = { lat, lon, z: world[2] };
  }
}

console.log(`  point facing camera: ${best.lat.toFixed(1)}, ${best.lon.toFixed(1)}  (world z = ${best.z.toFixed(3)})`);

/*
 * How much of the VISIBLE hemisphere is land? A globe opening over an ocean-heavy
 * region is legitimate, but it means a centre click rightly selects nothing — which
 * is the difference between a working raycast and a broken one.
 */
const az = (lat, lon) => latLonToDirection(lat, lon);
void az;

console.log('\n  what the centre ray actually resolves to:');
const centreDir = latLonToDirection(best.lat, best.lon);
console.log(`    lat/lon = ${best.lat.toFixed(2)}, ${best.lon.toFixed(2)}`);

/* Rough land check against well-known ocean boxes, so the answer is not circular. */
const oceans = [
  ['North Atlantic', 20, 60, -60, -15],
  ['South Atlantic', -50, 10, -40, 10],
  ['North Pacific', 10, 60, 140, -140],
  ['South Pacific', -50, 0, 150, -100],
  ['Indian Ocean', -40, 10, 45, 100],
  ['Southern Ocean', -80, -55, -180, 180],
];
function inBox(lat, lon, [name, lat0, lat1, lon0, lon1]) {
  const lonOk = lon0 <= lon1 ? lon >= lon0 && lon <= lon1 : lon >= lon0 || lon <= lon1;
  return lat >= lat0 && lat <= lat1 && lonOk;
}
const hit = oceans.find((o) => inBox(best.lat, best.lon, o));
console.log(`    this point is: ${hit ? hit[0] + ' (open water → a click correctly selects no country)' : 'possibly land'}`);

/*
 * Sweep the same 7 probe offsets the browser test used, and report what each
 * resolves to. This says whether the test's failure was the product or the probe
 * points.
 */
console.log('\n  the browser test\'s 7 probe points, resolved:');
const offsets = [[0, 0], [-0.12, -0.1], [0.12, -0.06], [-0.18, 0.06], [0.16, 0.1], [0, -0.16], [0, 0.14]];
const cameraZ = 3.05;
const halfFov = 19 * DEG; // fov 38, so half is 19
for (const [u, v] of offsets) {
  // NDC: u is horizontal fraction of half-width, v vertical fraction of half-height.
  const aspect = 1430 / 759;
  const dirWorld = [u * Math.tan(halfFov) * aspect, -v * Math.tan(halfFov), -1];
  const len = Math.hypot(dirWorld[0], dirWorld[1], dirWorld[2]);
  const nd = [dirWorld[0] / len, dirWorld[1] / len, dirWorld[2] / len];
  const origin = [0, 0, cameraZ];
  // Ray-sphere intersect with radius 1 at the origin.
  const b = 2 * (origin[0] * nd[0] + origin[1] * nd[1] + origin[2] * nd[2]);
  const c = cameraZ * cameraZ - 1;
  const disc = b * b - 4 * c;
  if (disc < 0) { console.log(`    (${u}, ${v}) -> misses the globe`); continue; }
  const t = (-b - Math.sqrt(disc)) / 2;
  const p = [origin[0] + nd[0] * t, origin[1] + nd[1] * t, origin[2] + nd[2] * t];
  // Undo the globe rotation to get the local (geographic) hit point.
  const unrotX = p[0];
  const rx = rotX * DEG;
  const y1 = p[1] * Math.cos(-rx) - p[2] * Math.sin(-rx);
  const z1 = p[1] * Math.sin(-rx) + p[2] * Math.cos(-rx);
  const ry = rotY * DEG;
  const x2 = p[0] * Math.cos(-ry) + z1 * Math.sin(-ry);
  const z2 = -p[0] * Math.sin(-ry) + z1 * Math.cos(-ry);
  void unrotX;
  const geo = directionToLatLon(x2, y1, z2);
  const ocean = oceans.find((o) => inBox(geo.latitude, geo.longitude, o));
  console.log(
    `    (${String(u).padStart(5)}, ${String(v).padStart(5)}) -> ${geo.latitude.toFixed(1)}, ${geo.longitude.toFixed(1)}  ${ocean ? ocean[0] : 'LAND (or coastal)'}`
  );
}
