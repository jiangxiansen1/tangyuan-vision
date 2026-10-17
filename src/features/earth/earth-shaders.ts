/**
 * earth-shaders.ts — the GLSL that makes the globe read as a lit planet.
 *
 * WHY A CUSTOM SHADER RATHER THAN MeshStandardMaterial
 * A standard material can light an object, but it cannot do the one thing that
 * makes an Earth read as Earth: show a DIFFERENT surface on the night side
 * (city lights) than on the day side, with a soft physical terminator between
 * them. That requires blending two textures by the sun angle, plus an additive
 * term for the lights. So the surface is a ShaderMaterial.
 *
 * THE TERMINATOR
 * The day/night boundary is not a hard hemisphere split. Earth's real terminator
 * is a gradient about 1.5° of arc wide at the surface, but rendered at this scale
 * a physically exact one looks like an aliased edge, so the blend band is widened
 * to be optically pleasing — and that choice is recorded here rather than being
 * passed off as the real thing.
 *
 * THE SUN POSITION
 * `uSunDirection` is computed on the CPU from the actual UTC time and the date's
 * solar declination. The globe is rotated so longitude 0 faces the correct way,
 * which means the lit side genuinely corresponds to which part of Earth is in
 * daylight right now. This is a real (if simplified — no analemma, no refraction)
 * solar position, not a decorative sweep.
 */

/* ------------------------------------------------------------- surface -- */

export const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vUv = uv;

    // World-space normal and position, needed so the lighting is computed in a
    // frame that does not spin with the mesh.
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPositionW = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const EARTH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uSpecularMask;
  uniform vec3  uSunDirection;
  uniform float uNightIntensity;
  /* How much of the NATURAL surface carries onto the night side. Separate from
     uNightIntensity, which now governs only the city-light trace on top. */
  uniform float uNightSurface;
  uniform float uTerminatorSoftness;
  uniform vec3  uAtmosphereColor;
  uniform float uAtmosphereStrength;
  uniform vec3  uCameraPosition;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vec3 normal = normalize(vNormalW);

    // Signed angle to the sun: +1 fully lit, -1 fully dark.
    float sunDot = dot(normal, normalize(uSunDirection));

    /* Soft terminator.
       smoothstep over a narrow band gives the day/night crossfade. Outside the
       band the surface is fully day or fully night, which is what keeps the
       lit limb crisp while the boundary itself stays soft. */
    float dayAmount = smoothstep(-uTerminatorSoftness, uTerminatorSoftness, sunDot);

    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

    /*
     * THE NIGHT SIDE IS NO LONGER A CITY-LIGHTS POSTER.
     *
     * V4 changed what the globe is about. The brief asks for a high-resolution
     * NATURAL-COLOUR surface as the subject, and for the glowing city lights to
     * stop being the main way the night side is rendered. So:
     *
     *   • the natural surface continues onto the night side, dimmed and cooled,
     *     so continents and oceans stay readable all the way around the globe
     *     instead of falling off a cliff at the terminator;
     *   • city lights remain, but only as a faint warm trace on top — real, and
     *     visibly subordinate to the terrain.
     *
     * uNightIntensity was 1.55 in V3, which made the lights the subject.
     */
    vec3 nightBase = dayColor * uNightSurface * vec3(0.42, 0.52, 0.78);
    vec3 lights = nightColor * uNightIntensity;

    /* Slightly warm the lights. Sodium and LED city light is not neutral, and a
       pure-grey glow reads as a rendering artefact rather than a city. */
    lights *= vec3(1.06, 1.0, 0.88);

    vec3 nightSide = nightBase + lights;

    vec3 surface = mix(nightSide, dayColor, dayAmount);

    /* Specular ocean.
       The mask is bright over water. Because the mask is sampled from a JPEG
       (8-bit, and blurred on purpose), it is used as a smooth wide highlight
       rather than a sharp reflection — a mirror-sharp highlight would expose how
       low-resolution the mask is. */
    float oceanMask = texture2D(uSpecularMask, vUv).r;
    vec3 viewDir = normalize(uCameraPosition - vPositionW);
    vec3 halfDir = normalize(viewDir + normalize(uSunDirection));
    float specular = pow(max(dot(normal, halfDir), 0.0), 42.0) * oceanMask;
    surface += vec3(0.72, 0.84, 1.0) * specular * 0.5 * dayAmount;

    /* Atmospheric limb on the surface itself.
       A Fresnel term brightens the silhouette. This is the inner half of the
       atmosphere effect; the outer halo is a separate, larger shell (see
       buildAtmosphere below) because a single mesh cannot both follow the
       surface and extend past it. */
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    // Only the sunlit limb scatters strongly — the dark limb does not glow.
    surface += uAtmosphereColor * fresnel * uAtmosphereStrength * (0.28 + 0.72 * max(sunDot, 0.0));

    /* Night-side limb: almost black, so the globe has a defined edge against the
       starfield instead of fading ambiguously into it. */
    surface = mix(surface, surface * 0.34, (1.0 - dayAmount) * fresnel);

    gl_FragColor = vec4(surface, 1.0);

    // Linear-space output; the renderer is configured for sRGB output so the
    // conversion happens once, at the end, rather than partially here.
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------- clouds -- */

export const CLOUD_VERTEX = EARTH_VERTEX;

export const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uCloudTexture;
  uniform vec3  uSunDirection;
  uniform float uCloudOpacity;
  uniform float uTerminatorSoftness;

  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vec4 cloud = texture2D(uCloudTexture, vUv);

    // The source is a greyscale mask converted to white + alpha by the build
    // script, so coverage lives in alpha and the colour is already white.
    float coverage = cloud.a;
    if (coverage < 0.01) discard;

    vec3 normal = normalize(vNormalW);
    float sunDot = dot(normal, normalize(uSunDirection));

    /* Clouds are lit only where the sun reaches them. On the night side they go
       nearly black rather than disappearing, because unlit cloud still occludes
       the city lights beneath it — which is visible and correct. */
    float lit = smoothstep(-uTerminatorSoftness, uTerminatorSoftness * 1.6, sunDot);
    float shade = mix(0.1, 1.0, lit);

    gl_FragColor = vec4(vec3(shade), coverage * uCloudOpacity * mix(0.55, 1.0, lit));

    #include <colorspace_fragment>
  }
`;

/* --------------------------------------------------------- atmosphere -- */

/**
 * The outer halo shell.
 *
 * Rendered on a slightly larger sphere with front-face culling, so only the far
 * hemisphere is drawn — which is what produces a ring of glow around the globe
 * instead of a fog over it. The intensity is driven by how close the view ray
 * passes to the sun direction, so the halo is brightest on the day limb and
 * nearly absent on the night limb. That asymmetry is the whole reason the effect
 * reads as scattered sunlight rather than as a sticker outline.
 */
export const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPositionW = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uAtmosphereColor;
  uniform vec3  uSunDirection;
  uniform vec3  uCameraPosition;
  uniform float uIntensity;

  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(uCameraPosition - vPositionW);

    /* View-ray grazing angle: 0 at the centre of the disk, 1 at the rim. Only
       the rim is visible on this shell because the near hemisphere is culled. */
    float rim = 1.0 - abs(dot(normal, viewDir));
    float halo = pow(rim, 3.2);

    /* Rayleigh-ish falloff: real scattered light falls off steeply with grazing
       angle, and the pow() above approximates that more cheaply than the actual
       integral, which is not worth its cost on a decorative shell. */
    float sunFacing = max(dot(normal, normalize(uSunDirection)), 0.0);

    float alpha = halo * uIntensity * (0.2 + 0.8 * sunFacing);
    gl_FragColor = vec4(uAtmosphereColor, alpha);

    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------ starfield -- */

export const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aPhase;

  uniform float uTime;
  uniform float uPixelRatio;

  varying float vBrightness;

  void main() {
    vBrightness = aBrightness;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    /* Size in screen pixels, attenuated by distance. The twinkle is a slow
       sine — a fast one turns a starfield into a disco. */
    float twinkle = 0.85 + 0.15 * sin(uTime * 0.6 + aPhase);
    gl_PointSize = aSize * uPixelRatio * twinkle;
  }
`;

export const STAR_FRAGMENT = /* glsl */ `
  precision highp float;

  varying float vBrightness;

  void main() {
    // Round points with a soft edge; a hard square point reads as a dead pixel.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;

    float a = smoothstep(0.5, 0.0, r) * vBrightness;

    /* Very slightly warm-biased. Real starfields are not monochrome, and a
       single hue across hundreds of points reads as a texture rather than a sky. */
    gl_FragColor = vec4(vec3(0.94, 0.96, 1.0), a);
  }
`;


/* --------------------------------------------------------- point surface -- */

/*
 * POINT SURFACE
 * The globe's visible surface is a sphere of points. Their colour comes from the
 * SAME real data the textured version used — earth-specular.jpg is bright over
 * water (ocean mask), earth-day.jpg carries land brightness — and their light is
 * the same real sun-angle blend, taken from the CPU-computed sub-solar point.
 * The textures are only ever SAMPLED to classify a dot; they are never shown as a
 * photo on the sphere. No clouds, no terrain texture, no invented geometry.
 */
export const EARTH_POINTS_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSize;
  attribute float aRand;
  attribute float aLand;
  varying float vLand;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vUv = uv;
    vLand = aLand;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPositionW = worldPos.xyz;
    vec4 mv = viewMatrix * worldPos;
    // Dots grow as the camera closes in; a per-dot size jitter (aRand) breaks the
    // regular spiral so the field does not moire against the pixel grid.
    float sizeScale = 0.94 + 0.12 * aRand;
    gl_PointSize = max(1.0, uSize * uPixelRatio * sizeScale * (3.05 / max(-mv.z, 0.001)));
    gl_Position = projectionMatrix * mv;
  }
`;

export const EARTH_POINTS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uSpecularMask;
  uniform vec3  uSunDirection;
  uniform vec3  uOceanColor;
  uniform vec3  uLandColor;
  varying float vLand;
  uniform float uNightSurface;
  uniform float uTerminatorSoftness;
  uniform vec3  uAtmosphereColor;
  uniform float uAtmosphereStrength;
  uniform vec3  uCameraPosition;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    // Soft round dot: feathering the edge (instead of a hard discard) removes the
    // aliasing moire between the point lattice and the pixel grid while keeping a
    // crisp silhouette, because back-hemisphere dots are still depth-culled.
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.3, d);
    if (alpha <= 0.002) discard;

    vec3 normal = normalize(vNormalW);
    float sunDot = dot(normal, normalize(uSunDirection));
    float dayAmount = smoothstep(-uTerminatorSoftness, uTerminatorSoftness, sunDot);

    // Real land/ocean split from the imagery itself: land is warmer (R>B), ocean bluer.
    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    // Land/ocean from the SAME Natural Earth polygons as the selection (vLand).
    float landMask = vLand;

    // Cool blue-white land, modulated by the real imagery brightness (so it is
    // still the data, not a flat painted colour); deep-blue ocean.
    float landVar = clamp(dot(dayColor, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    vec3 land = uLandColor * (0.86 + 0.34 * landVar);
    vec3 base = mix(uOceanColor, land, landMask);

    // Full light on the day side; dimmed but readable on the night side.
    float lit = mix(uNightSurface, 1.0, dayAmount);
    vec3 color = base * lit;

    // Restrained limb glow, strongest on the sunlit edge.
    vec3 viewDir = normalize(uCameraPosition - vPositionW);
    float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color += uAtmosphereColor * fres * uAtmosphereStrength * (0.18 + 0.82 * max(sunDot, 0.0));

    gl_FragColor = vec4(color, alpha);

    #include <colorspace_fragment>
  }
`;


/* ------------------------------------------------------------ city layer -- */

/*
 * CITY LAYER
 * Points placed at the real coordinates of the (small) Natural Earth populated-
 * places set. Brightness is boosted on the night side by the SAME real sun angle
 * used by the globe, so the city layer follows the true day/night terminator and
 * never pretends to be a satellite night-lights image. Used for both the
 * decorative light layer (small, dense) and the interactive marker layer (larger,
 * zoom-gated) — the two differ only by uniform values, not by data.
 */
export const CITY_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSize;
  attribute float aSize;
  attribute float aPop;
  varying vec3 vNormalW;
  varying float vPop;

  void main() {
    vPop = aPop;
    vNormalW = normalize(mat3(modelMatrix) * position);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * worldPos;
    gl_PointSize = max(1.0, uSize * uPixelRatio * aSize * (3.05 / max(-mv.z, 0.001)));
    gl_Position = projectionMatrix * mv;
  }
`;

export const CITY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uSunDirection;
  uniform vec3  uColor;
  uniform float uTerminatorSoftness;
  uniform float uNightBoost;
  uniform float uMinPop;
  uniform float uOpacity;

  varying vec3 vNormalW;
  varying float vPop;

  void main() {
    if (vPop < uMinPop) discard;

    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.2, d);
    if (a <= 0.002) discard;

    vec3 n = normalize(vNormalW);
    float sunDot = dot(n, normalize(uSunDirection));
    float dayAmount = smoothstep(-uTerminatorSoftness, uTerminatorSoftness, sunDot);
    float night = 1.0 - dayAmount;

    // Brighter on the night side, but still restrained.
    float g = 0.5 + uNightBoost * night;
    gl_FragColor = vec4(uColor * g, a * uOpacity * (0.55 + 0.45 * g));

    #include <colorspace_fragment>
  }
`;
