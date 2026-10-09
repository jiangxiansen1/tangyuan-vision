/**
 * MiniWindow — tier 3a: the Lab and Projects entries.
 *
 * These are deliberately a different shape from the core windows. A compact
 * window is wide and short instead of tall, carries a small preview strip rather
 * than a large image, and has no tilt, no specular and no parallax.
 *
 * That restraint is the point: if these looked like the core pair, the hierarchy
 * the brief asks for would collapse and the page would be four competing windows
 * instead of two.
 */

import { useRef } from 'react';
import type { SceneRoute } from '@/app/routes';
import { Icon, SceneIcon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { PHOTOS } from '@/content';
import './mini-window.css';

export interface MiniWindowProps {
  route: SceneRoute;
  onOpen: () => void;
}

/** A small set of frames for the preview strip. */
function stripFor(sceneId: string) {
  const preferred: Record<string, string[]> = {
    lab: ['abstract', 'machine'],
    projects: ['machine', 'abstract'],
  };
  for (const category of preferred[sceneId] ?? []) {
    const found = PHOTOS.filter((p) => p.category === category).slice(0, 3);
    if (found.length > 0) return found;
  }
  return PHOTOS.slice(0, 3);
}

export function MiniWindow({ route, onOpen }: MiniWindowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const strip = stripFor(route.id);

  /** A short horizontal drift on the preview strip. No tilt — see the header. */
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(rect.width, 1);
    el.style.setProperty('--mw-shift', `${((px - 0.5) * -14).toFixed(1)}px`);
  };

  const onPointerLeave = () => {
    ref.current?.style.setProperty('--mw-shift', '0px');
  };

  return (
    <li className="mwin">
      <button
        ref={ref}
        type="button"
        className="mwin__btn"
        onClick={onOpen}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        aria-label={`${route.label} — ${route.blurb}`}
        data-cursor="link"
      >
        {/* The strip: three frames side by side, drifting slightly. It exists so
            the window has a preview without competing with the core pair. */}
        <span className="mwin__strip" aria-hidden="true">
          {strip.map((photo, i) => (
            <span key={photo.id} className="mwin__strip-item" style={{ ['--i' as string]: i }}>
              <SmartImage
                src={photo.thumb ?? photo.src}
                alt=""
                width={photo.width}
                height={photo.height}
                tone={photo.tone}
                sizes="10vw"
                failureLabel=""
              />
            </span>
          ))}
        </span>

        <span className="mwin__body">
          <span className="mwin__icon">
            <SceneIcon scene={route.id} size={17} />
          </span>

          <span className="mwin__titles">
            <span className="mwin__title">{route.label}</span>
            <span className="mwin__blurb">{route.blurb}</span>
          </span>

          <span className="mwin__arrow" aria-hidden="true">
            <Icon name="arrow-right" size={16} />
          </span>
        </span>
      </button>
    </li>
  );
}
