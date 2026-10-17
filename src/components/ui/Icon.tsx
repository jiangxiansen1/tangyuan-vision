/**
 * Icon — the project's own icon set.
 *
 * The brief explicitly rejects emoji standing in for designed icons. Rather than
 * pull a 300 KB icon package for the eleven glyphs this site needs, they are
 * drawn here as inline SVG on a single 24×24 grid with a consistent 1.5px stroke.
 * That keeps them visually coherent, costs almost nothing, and lets each one
 * take `currentColor`.
 *
 * All icons are decorative by default (aria-hidden); the accessible name comes
 * from the button or link that contains them. Pass `title` only when an icon
 * genuinely stands alone.
 */

import type { SVGProps } from 'react';

export type IconName =
  | 'about'
  | 'camera'
  | 'route'
  | 'lab'
  | 'layers'
  | 'journal'
  | 'signal'
  | 'close'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-out'
  | 'arrow-down'
  | 'grid'
  | 'expand'
  | 'sound-on'
  | 'sound-off'
  | 'music'
  | 'settings'
  | 'keyboard'
  | 'check'
  | 'alert'
  | 'clock'
  | 'location'
  | 'aperture'
  | 'chevron-left'
  | 'chevron-right'
  | 'menu'
  | 'lock'
  | 'video'
  | 'sparkle';

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  /** Rendered size in px. Stroke weight is fixed in the 24-grid. */
  size?: number;
  /** Supply only when the icon conveys meaning with no adjacent text. */
  title?: string;
}

const PATHS: Record<IconName, React.ReactNode> = {
  about: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20.2c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6" />
    </>
  ),
  camera: (
    <>
      <path d="M3.2 8.6h3.1l1.5-2.2h8.4l1.5 2.2h3.1v9.6H3.2z" />
      <circle cx="12" cy="13.2" r="3.4" />
      <path d="M8.4 8.6V7.2h7.2v1.4" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18.4" r="2.4" />
      <circle cx="18" cy="5.6" r="2.4" />
      <path d="M8.4 18.4h6.1a3.5 3.5 0 0 0 0-7H9.5a3.5 3.5 0 0 1 0-6.5h6.1" />
    </>
  ),
  lab: (
    <>
      <path d="M9.2 3.6v6.1L4.8 17.5a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3l-4.4-7.8V3.6" />
      <path d="M8 3.6h8" />
      <path d="M6.9 14.4h10.2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.4 3.4 8 12 12.6 20.6 8z" />
      <path d="m3.4 12.6 8.6 4.6 8.6-4.6" />
      <path d="m3.4 16.8 8.6 4.6 8.6-4.6" />
    </>
  ),
  journal: (
    <>
      <path d="M5.6 3.6h11a2 2 0 0 1 2 2v14.8H7.6a2 2 0 0 1-2-2z" />
      <path d="M5.6 16.4h13" />
      <path d="M9 7.6h6.2M9 10.8h6.2" />
    </>
  ),
  signal: (
    <>
      <path d="M12 13.4v6.8" />
      <path d="M8.7 10.1a4.7 4.7 0 0 1 6.6 0" />
      <path d="M6 7.4a8.5 8.5 0 0 1 12 0" />
      <circle cx="12" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8" />,
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  'arrow-out': (
    <>
      <path d="M8.4 15.6 15.6 8.4" />
      <path d="M10.2 8.4h5.4v5.4" />
      <path d="M18 13.8v4.2a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V7.8A1.8 1.8 0 0 1 6 6h4.2" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.6" height="6.6" rx="1" />
      <rect x="13.4" y="4" width="6.6" height="6.6" rx="1" />
      <rect x="4" y="13.4" width="6.6" height="6.6" rx="1" />
      <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1" />
    </>
  ),
  expand: (
    <>
      <path d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9" />
      <path d="M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9" />
      <path d="M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15" />
      <path d="M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15" />
    </>
  ),
  'sound-on': (
    <>
      <path d="M4.6 9.4h3.2L12 5.8v12.4l-4.2-3.6H4.6z" />
      <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18 6.8a7.4 7.4 0 0 1 0 10.4" />
    </>
  ),
  'sound-off': (
    <>
      <path d="M4.6 9.4h3.2L12 5.8v12.4l-4.2-3.6H4.6z" />
      <path d="m16 10 4 4M20 10l-4 4" />
    </>
  ),
  music: (
    <>
      <circle cx="7" cy="17.4" r="2.6" />
      <circle cx="17.6" cy="15.4" r="2.6" />
      <path d="M9.6 17.4V7.2l10.6-2.6v10.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.4v2.2M12 18.4v2.2M4.9 7.5l1.9 1.1M17.2 15.4l1.9 1.1M4.9 16.5l1.9-1.1M17.2 8.6l1.9-1.1" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6.6" width="18" height="10.8" rx="2" />
      <path d="M6.6 10.2h.01M9.8 10.2h.01M13 10.2h.01M16.2 10.2h.01M8 13.8h8" />
    </>
  ),
  check: <path d="m5.4 12.4 4.4 4.4L18.6 7.6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.8v5.2" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.2 2" />
    </>
  ),
  location: (
    <>
      <path d="M12 21c4.2-4.6 6.4-7.9 6.4-10.6A6.4 6.4 0 0 0 5.6 10.4C5.6 13.1 7.8 16.4 12 21z" />
      <circle cx="12" cy="10.2" r="2.4" />
    </>
  ),
  aperture: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4 8.5 9.4M20.6 12h-6.9M16.4 19.6 13 13.6M7.6 19.6l3.4-6M3.4 12h6.9M7.6 4.4 11 10.4" />
    </>
  ),
  'chevron-left': <path d="m14.4 6.6-5.4 5.4 5.4 5.4" />,
  'chevron-right': <path d="m9.6 6.6 5.4 5.4-5.4 5.4" />,
  menu: <path d="M4 7.4h16M4 12h16M4 16.6h16" />,
  lock: (
    <>
      <rect x="5.2" y="10.4" width="13.6" height="9.6" rx="2" />
      <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="12.5" height="12" rx="2.6" />
      <path d="M15.5 10.6 21 7.6v8.8l-5.5-3" />
    </>
  ),

  sparkle: (
    <>
      {/*
        A four-point star with concave sides. The previous straight-edged
        four-point polygon read as a lightning bolt at small sizes, which is a
        different idea entirely — the curve is what makes it a star.
      */}
      <path d="M12 3.4c.5 3.6 2.1 5.5 5.6 6.1-3.5.6-5.1 2.5-5.6 6.1-.5-3.6-2.1-5.5-5.6-6.1 3.5-.6 5.1-2.5 5.6-6.1z" />
      <path d="M17.9 15.6c.3 1.9 1.1 2.9 3 3.2-1.9.3-2.7 1.3-3 3.2-.3-1.9-1.1-2.9-3-3.2 1.9-.3 2.7-1.3 3-3.2z" />
    </>
  ),
};

export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  const glyph = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
}

/**
 * SceneIcon — maps a scene id to the glyph that represents it.
 * Kept separate so the icon set stays generic and reusable.
 */
export function SceneIcon({ scene, size = 20 }: { scene: string; size?: number }) {
  const map: Record<string, IconName> = {
    about: 'about',
    photography: 'camera',
    riding: 'route',
    lab: 'lab',
    projects: 'layers',
    journal: 'journal',
    contact: 'signal',
    secret: 'lock',
  };
  return <Icon name={map[scene] ?? 'sparkle'} size={size} />;
}
