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
 * roughly the central ±18°.
 *
 * WHY THE ESRI EXPORT ENDPOINT
 * Esri's World_Imagery MapServer exposes /export, which returns ONE rendered
 * image for a bounding box in a chosen spatial reference. Measured against the
 * live service:
 *
 *   imageSR=3857  -> 200, image/jpeg, Access-Control-Allow-Origin: *
 *
 * That is the ideal primitive here: one request per view instead of a tile
 * pyramid, delivered in Web-Mercator, which is the SAME projection the patch's
 * vertices are laid out in (see buildPatchGeometry). The image therefore lands on
 * the sphere with no resampling at all.
 *
 * The imagery is a public Esri endpoint, so no token is required. Attribution is
 * shown in the page footer, which is what Esri's terms ask for.
 */

import * as THREE from 'three';

/**
 * Half-size of the covered patch, in degrees of latitude.
 *
 * 22 rather than 18 because the edge is now feathered: the fully-opaque middle
 * reaches only ~0.40 of the half-width, so the useful coverage is about 9 degrees
 * unless the patch itself is larger. Before feathering, 18 was the visible edge.
 */
export const PATCH_HALF_DEG = 22;

/**
 * Pixel resolution to request for a given camera distance.
 *
 * The patch always covers the same 36 degrees of sphere, so the delivered image
 * is what changes: closer to the surface the same angular patch is drawn across
 * more screen pixels, and the request has to keep up. 2048 is the largest size the
 * service reliably returns in one go.
 */
export function imagerySizeForDistance(distance: number): number {
  if (distance < 1.35) return 2048;
  if (distance < 1.6) return 1600;
  if (distance < 1.8) return 1280;
  return 1024;
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

/**
 * Build the World Imagery export URL for a centred patch.
 *
 * bbox is (minLon, minLat, maxLon, maxLat) in WGS84; imageSR=3857 asks Esri to
 * deliver it in Web Mercator, matching the patch geometry exactly.
 * f=image makes the service return the picture directly instead of JSON metadata.
 */
export function imageryExportUrl(
  lat: number,
  lon: number,
  halfDeg: number,
  size: number,
): string {
  const north = Math.min(85, lat + halfDeg);
  const south = Math.max(-85, lat - halfDeg);
  const west = lon - halfDeg;
  const east = lon + halfDeg;
  const params = new URLSearchParams({
    bbox: `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`,
    bboxSR: '4326',
    imageSR: '3857',
    size: `${size},${size}`,
    format: 'jpg',
    f: 'image',
  });
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params.toString()}`;
}

/**
 * Material for the basemap patch: a radial alpha falloff so the imagery dissolves
 * into the dots instead of ending on a straight edge.
 *
 * A canvas-generated alphaMap would be simpler, but the patch's UV space is
 * Mercator while the texture is sampled linearly, so a circular mask baked into a
 * texture arrives on screen as an ellipse. Computing the falloff in the fragment
 * shader from vUv keeps the decision in one place and lets the radii be tuned
 * without regenerating any image.
 *
 * Inner radius 0.36 keeps the useful middle fully opaque; the outer 0.14 of the
 * patch is the whole fade band.
 */
export function createPatchMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: null as THREE.Texture | null },
      uOpacity: { value: 0 },
      uHasMap: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uHasMap;
      varying vec2 vUv;

      void main() {
        // Nothing to draw until the first image arrives; avoids a black patch
        // appearing for the moment between fading in and the texture loading.
        if (uHasMap < 0.5) discard;

        // Distance from the patch centre in UV space. The patch spans exactly one
        // full 0..1 square, so 0.5 is its half-width.
        float d = distance(vUv, vec2(0.5));
        float alpha = smoothstep(0.5, 0.40, d) * uOpacity;
        if (alpha <= 0.004) discard;

        vec4 texel = texture2D(uMap, vUv);
        gl_FragColor = vec4(texel.rgb, alpha);
      }
    `,
  });
}


