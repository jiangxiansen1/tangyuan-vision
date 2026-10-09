/**
 * RefractionDefs — the SVG filter that gives the top glass tier real optical
 * displacement instead of plain blur.
 *
 * HOW IT WORKS
 * A turbulence field drives a displacement map, which shifts the backdrop's
 * sampled pixels. Applied through `backdrop-filter`, this refracts whatever is
 * behind the pane — the effect the brief asked for beyond `blur()`.
 *
 * WHY IT IS A SEPARATE, GLOBALLY-MOUNTED COMPONENT
 * `backdrop-filter: url(#id)` resolves against the whole document, so the filter
 * must exist exactly once and be reachable from any pane. Duplicating it per
 * surface would work visually but multiplies the filter cost for no gain.
 *
 * COST, STATED PLAINLY
 * An SVG backdrop filter forces an off-screen buffer per surface that uses it.
 * That is why `.glass--refract` is granted only to the handful of large, static
 * panes in the product, and why the tier is switched off below 768px, under
 * prefers-reduced-transparency, and when the visitor selects a lower glass
 * quality. On Firefox, where url() in backdrop-filter has historically been
 * unreliable, glass.css substitutes a heavier blur instead.
 *
 * Mounted once, from App.tsx.
 */

export function RefractionDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', pointerEvents: 'none', overflow: 'hidden' }}
    >
      <defs>
        <filter
          id="tv-liquid-refract"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          filterUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          {/* A low-frequency field: large, slow warps read as a thick glass
              body. baseFrequency is kept small so the edge does not shimmer. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" seed="7" result="warp" />

          {/* Keep the displacement gentle — 5px at the pane edge. Anything
              larger turns a readable panel into a fairground mirror. */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />

          {/* Re-saturate and lift slightly: displacement alone darkens the
              result, which would break text contrast on the pane. */}
          <feColorMatrix
            in="displaced"
            type="matrix"
            values="1.06 0 0 0 0.01
                    0 1.06 0 0 0.01
                    0 0 1.08 0 0.015
                    0 0 0 1 0"
          />
        </filter>
      </defs>
    </svg>
  );
}
