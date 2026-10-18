/**
 * map-overlay.ts — a real basemap patch laid onto the dotted globe.
 *
 * WHY A PATCH AND NOT A TILED GLOBE
 * The globe is a point cloud that samples one static texture. That is what gives
 * it its look, and it is also why zooming in reveals nothing new: the dots spread
 * apart and the texture runs out of pixels. Replacing the renderer would throw
 * away the look; tiling the whole sphere would mean re-projecting hundreds of
 * tiles and would stall on every pan.
 *
 * So only the patch of sphere you are actually looking at gets a real basemap,
 * roughly the central ±18°. At that scale a Mercator image and the sphere differ
 * by well under a pixel, which is why the image can be laid on directly.
 *
 * WHY THE STATIC MAP API
 * AMap's "Web service" key grants REST endpoints, not XYZ tiles — AMap publishes
 * no public tile endpoint. /v3/staticmap returns a rendered image of a bounding
 * region, which is exactly what a patch needs: one request per view, not a tile
 * pyramid.
 */

import * as THREE from 'three';

/** Half-size of the covered patch, in degrees of latitude. */
export const PATCH_HALF_DEG = 18;

/** AMap zoom that corresponds to a camera distance. Verified against the map's
 *  own scale: zoom 16 shows a few city blocks, zoom 4 shows a continent. */
export function amapZoomForDistance(distance: number): number {
  const z = 16.5 - (distance - 1.1) * 2.6;
  return Math.max(3, Math.min(17, Math.round(z)));
}

/** Web-Mercator Y for a latitude, normalised to 0..1 (north = 0). */
function mercY(latDeg: number): number {
  const clamped = Math.max(-85.05, Math.min(85.05, latDeg));
  const rad = (clamped * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI);
}

function invMercY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/**
 * A spherical patch centred on (lon0, lat0), subdivided finely enough that the
 * surface reads as smooth at any zoom the camera can reach.
 *
 * Vertex latitudes are spaced in MERCATOR space while the texture's v runs
 * linearly 0..1 over the same span. That is what makes a Mercator image land
 * correctly on a sphere: spacing vertices by plain latitude would stretch the
 * image toward the poles.
 */
export function buildPatchGeometry(radius: number, lat0: number, lon0: number, halfDeg = PATCH_HALF_DEG): THREE.BufferGeometry {
  const SEG = 24;
  const northLimit = Math.min(85, lat0 + halfDeg);
  const southLimit = Math.max(-85, lat0 - halfDeg);
  const yTop = mercY(northLimit);
  const yBottom = mercY(southLimit);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG;
    const lat = invMercY(yTop + (yBottom - yTop) * t);
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const lon = lon0 - halfDeg + u * halfDeg * 2;
      const lonR = ((-180 - lon) * Math.PI) / 180;
      const latR = (lat * Math.PI) / 180;
      const v = new THREE.Vector3(0, 0, radius)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -latR)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -lonR);
      positions.push(v.x, v.y, v.z);
      // v is flipped: texture row 0 is the north edge.
      uvs.push(u, 1 - t);
    }
  }

  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i;
      const b = a + 1;
      const c = a + (SEG + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export interface StaticMapRequest {
  lat: number;
  lon: number;
  zoom: number;
  key: string;
  /** Pixel size per side before the `scale` multiplier (max 1024). */
  size?: number;
  scale?: number;
}

/**
 * Build the AMap static-map URL for a centred view.
 *
 * `scale=2` doubles the delivered resolution, so the default request is
 * effectively 2048x2048 — enough that the patch does not look soft when the
 * camera is at its closest.
 */
export function staticMapUrl({ lat, lon, zoom, key, size = 1024, scale = 2 }: StaticMapRequest): string {
  const params = new URLSearchParams({
    location: `${lon.toFixed(6)},${lat.toFixed(6)}`,
    zoom: String(zoom),
    size: `${size}*${size}`,
    scale: String(scale),
    key,
  });
  return `https://restapi.amap.com/v3/staticmap?${params.toString()}`;
}

/** Read the key from the environment. Absent = the whole layer stays off. */
export function readAmapKey(): string | null {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_AMAP_KEY;
  const key = typeof raw === 'string' ? raw.trim() : '';
  return key ? key : null;
}
