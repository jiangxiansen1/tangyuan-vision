/**
 * PhotoScene — scene 03, mirrored split: photographs left (~64%), text right.
 *
 * The media column holds a COMPACT composition — one lead frame plus two
 * support frames — because a full mosaic belongs to the /photography route,
 * not to a full-screen scene. Categories stay the agreed pair (风光 / 人像);
 * 人像 keeps its honest empty state until real portraits exist, and every
 * placeholder carries its 示例 marker.
 */

import { useMemo, useState } from 'react';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { isCoverPhoto, PHOTOS } from '@/content';
import type { Photo } from '@/content/types';
import { SmartImage } from '@/components/ui/SmartImage';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { SceneShell } from './SceneShell';

type Filter = 'all' | 'landscape' | 'portrait';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'landscape', label: '风光' },
  { value: 'portrait', label: '人像' },
];

function bucketOf(p: Photo): 'landscape' | 'portrait' | 'unclassified' {
  if (p.category === 'landscape') return 'landscape';
  if (p.category === 'portrait') return 'portrait';
  return 'unclassified';
}

export function PhotoScene() {
  const route = NAVIGABLE_ROUTES.find((r) => r.id === 'photography')!;
  const [filter, setFilter] = useState<Filter>('all');

  const pool = useMemo(
    () => PHOTOS.filter((p) => (filter === 'all' ? true : bucketOf(p) === filter)),
    [filter]
  );
  /*
   * One lead + two supports: enough to be a photograph scene, small enough to stay
   * inside a single viewport. The rest lives on the route.
   *
   * COVER PHOTOS COME FIRST. Taking the first three by sort order meant the scene
   * showed whatever had been imported first — for a while, three near-identical
   * portraits. The three marked `feature` are the ones chosen as the cover, so they
   * lead; everything else keeps its order behind them.
   */
  const shown = useMemo(() => {
    const anyFlagged = PHOTOS.some((p) => p.feature === true);
    const ordered = [...pool].sort(
      (a, b) => Number(isCoverPhoto(b, anyFlagged)) - Number(isCoverPhoto(a, anyFlagged))
    );
    return ordered.slice(0, 3);
  }, [pool]);

  return (
    <SceneShell
      route={route}
      index="03"
      variant="split"
      mediaFirst
      lede="光落在具体事物上的那一刻。分类只有两种：风光，与人像。"
      headExtra={
        <div className="pscene__filters" role="group" aria-label="按分类筛选作品">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="pscene__filter"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              <span>{f.label}</span>
              <span className="pscene__filter-count u-mono">
                {f.value === 'all'
                  ? PHOTOS.length
                  : PHOTOS.filter((p) => bucketOf(p) === f.value).length}
              </span>
            </button>
          ))}
        </div>
      }
      ctas={[{ to: '/photography', label: '进入作品集', en: 'GALLERY', primary: true }]}
    >
      {shown.length === 0 ? (
        <p className="vscene__empty pscene__empty-media">
          人像分类下还没有作品。等待真实作品入库——不用占位图冒充。
        </p>
      ) : (
        <ul className="pmosaic pmosaic--scene">
          {shown.map((p, i) => (
            <li key={p.id} className={i === 0 ? 'pmosaic__lead' : undefined}>
              <SmartImage
                src={p.thumb ?? p.src}
                alt={p.title}
                width={p.width}
                height={p.height}
                tone={p.tone}
                sizes="(min-width: 900px) 44vw, 92vw"
              />
              <span className="pmosaic__cap">
                <span className="pmosaic__title">{p.title}</span>
                <ProvenanceBadge provenance={p.provenance} compact />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="vscene__note">
        共 {PHOTOS.length} 张：风光{' '}
        {PHOTOS.filter((p) => bucketOf(p) === 'landscape').length} 张，人像{' '}
        {PHOTOS.filter((p) => bucketOf(p) === 'portrait').length} 张。
      </p>
    </SceneShell>
  );
}
