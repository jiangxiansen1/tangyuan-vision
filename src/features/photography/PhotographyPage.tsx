/**
 * PhotographyPage — the portfolio.
 *
 * NOT A UNIFORM GRID. The brief rejects the "many identical rounded cards" look,
 * so the layout is an asymmetric editorial one:
 *
 *   • Photos marked `feature: true` in the content take a full-width band with a
 *     large side caption.
 *   • Everything else flows into a masonry-ish column layout where each tile
 *     keeps its own aspect ratio — a 4:3 landscape sits next to a 4:5 portrait
 *     without either being cropped into the other's shape.
 *   • The surrounding space takes its tone from the active category, so the
 *     scene's colour responds to the work rather than the reverse.
 *
 * State is held here (active category, lightbox index) because the lightbox is a
 * single instance over the whole page, and filtering must keep its index in step
 * with the filtered list — a mismatch there is the classic lightbox bug where
 * "next" jumps to an unrelated photo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PHOTOS, PHOTO_CATEGORY_LABELS, SETTINGS } from '@/content';
import type { Photo, PhotoCategory } from '@/content/types';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRevealOnView } from '@/hooks/useRevealOnView';
import { playSfx } from '@/store/useSoundStore';
import { Lightbox } from './Lightbox';
import './photography.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'photography')!;

type Filter = 'all' | PhotoCategory;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  ...(Object.entries(PHOTO_CATEGORY_LABELS) as Array<[PhotoCategory, string]>).map(([value, label]) => ({
    value,
    label: label.split(' / ')[0],
  })),
];

export default function PhotographyPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: PHOTOS[0]?.src ?? SETTINGS.ogImage,
    path: route.path,
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const visible = useMemo(
    () => (filter === 'all' ? PHOTOS : PHOTOS.filter((p) => p.category === filter)),
    [filter]
  );

  const features = useMemo(() => visible.filter((p) => p.feature), [visible]);
  const rest = useMemo(() => visible.filter((p) => !p.feature), [visible]);

  // A filter change must not leave the lightbox pointing at a photo that is no
  // longer in the list.
  useEffect(() => {
    setLightboxIndex(-1);
  }, [filter]);

  const openAt = useCallback(
    (photo: Photo) => {
      const i = visible.findIndex((p) => p.id === photo.id);
      if (i < 0) return;
      playSfx('open');
      setLightboxIndex(i);
    },
    [visible]
  );

  // The active category tints the scene. Defaulting to the first photo's tone
  // keeps the "all" view coherent rather than neutral.
  const activeTone = visible[0]?.tone ?? '#101820';

  return (
    <SceneLayout route={route} bodyClassName="photography">
      <div className="photography__tone" style={{ ['--tone' as string]: activeTone }} aria-hidden="true" />

      {/* ------------------------------------------------------- sample note -- */}
      {PHOTOS.some((p) => p.provenance === 'sample') ? (
        <GlassSurface tier="standard" className="photography__notice" radius="var(--r-lg)">
          <Icon name="sparkle" size={16} />
          <div>
            <p className="photography__notice-title">当前展示的是示例图像</p>
            <p className="photography__notice-body">
              这些是程序生成的抽象光景，不是真实拍摄的照片——我还没有提供作品。
              它们的作用是完整跑通分类筛选、不对称排版、懒加载与灯箱浏览的流程。
              因此这里不会出现任何虚构的拍摄地点、设备或 EXIF 数据。
              替换方法见 <code>docs/CONTENT.md</code>。
            </p>
          </div>
        </GlassSurface>
      ) : null}

      {/* ---------------------------------------------------------- filters -- */}
      <div className="photography__filters" role="group" aria-label="按分类筛选作品">
        {FILTERS.map((f) => {
          const count = f.value === 'all' ? PHOTOS.length : PHOTOS.filter((p) => p.category === f.value).length;
          const disabled = count === 0;
          return (
            <button
              key={f.value}
              type="button"
              className="photography__filter"
              aria-pressed={filter === f.value}
              disabled={disabled}
              onClick={() => {
                setFilter(f.value);
                playSfx('select');
              }}
            >
              <span>{f.label}</span>
              <span className="photography__filter-count u-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ empty -- */}
      {visible.length === 0 ? (
        <div className="placeholder">
          <p className="placeholder__title">这个分类下还没有作品</p>
          <p className="u-caption">换一个分类，或者在后台新增作品后重新构建。</p>
        </div>
      ) : null}

      {/* ------------------------------------------------------- feature band -- */}
      {features.map((photo, i) => (
        <FeaturePhoto key={photo.id} photo={photo} index={i} onOpen={() => openAt(photo)} />
      ))}

      {/* -------------------------------------------------------- flow layout -- */}
      {rest.length > 0 ? (
        <section className="section" aria-labelledby="photography-more">
          <div className="section__head">
            <h2 id="photography-more" className="section__title">
              其余作品
            </h2>
            <p className="u-label">{rest.length} IMAGES</p>
          </div>

          <ul className="photography__flow">
            {rest.map((photo, i) => (
              <FlowPhoto key={photo.id} photo={photo} index={i} onOpen={() => openAt(photo)} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------- replace note -- */}
      <section className="section" aria-labelledby="photography-how">
        <div className="section__head">
          <h2 id="photography-how" className="section__title">
            关于这个板块的技术实现
          </h2>
          <p className="u-label">IMPLEMENTATION</p>
        </div>

        <div className="photography__impl">
          <dl className="spec-table">
            <caption>摄影作品的完整内容模型 —— 未填写的字段不会显示空标签</caption>
            <tbody>
              {[
                ['id', '唯一标识，用于灯箱定位与排序'],
                ['title / category', '标题与分类，分类驱动筛选'],
                ['src / thumb', '原图与缩略图路径，缩略图缺失时自动回退到原图'],
                ['width / height', '真实像素尺寸，用于预留版面避免加载时跳动'],
                ['description', '简短描述，显示在灯箱中'],
                ['tone', '主色调，用于占位背景与灯箱环境色'],
                ['takenAt / location / camera / lens', '可选字段：未提供时整行不渲染'],
                ['exif', '可选字段：绝不会被伪造'],
                ['feature / order', '排版权重与顺序'],
                ['provenance', 'real 或 sample，sample 会在界面上显示标记'],
              ].map(([field, note]) => (
                <tr key={field}>
                  <th scope="row">{field}</th>
                  <td>{note}</td>
                </tr>
              ))}
            </tbody>
          </dl>

          <div className="photography__impl-notes">
            <p>
              <b>图片加载失败时</b>会显示带对角线的占位框和「图像未能加载」说明，而不是浏览器的破图图标。
              缩略图缺失时会先自动尝试原图，都失败才标记为错误。
            </p>
            <p>
              <b>懒加载</b>是默认行为；只有灯箱打开的那一张会以 eager + 高优先级请求，
              因为它是此刻唯一的视觉主体。图片带真实的 width/height，
              并且在容器上预留了 aspect-ratio，因此加载完成不会引起任何布局位移。
            </p>
            <p>
              <b>灯箱</b>通过 Portal 挂到 body，用焦点陷阱接管 Tab，关闭后把焦点还给触发它的那张卡片。
              左右方向键切换、Escape 关闭、空格缩放，移动端支持左右滑动——
              垂直手势则交还给描述区域的正常滚动。
            </p>
          </div>
        </div>
      </section>

      <div className="photography__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>

      <Lightbox
        photos={visible}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(-1)}
      />
    </SceneLayout>
  );
}

/* ------------------------------------------------------------------------ */

/** A full-width band: large image, caption to the side, its own aspect ratio. */
function FeaturePhoto({ photo, index, onOpen }: { photo: Photo; index: number; onOpen: () => void }) {
  const reveal = useRevealOnView<HTMLElement>({ delay: index * 60, threshold: 0.08 });

  return (
    <article
      ref={reveal.ref}
      className={`${reveal.className} photography__feature`}
      style={reveal.style}
      data-cursor="view"
    >
      <button type="button" className="photography__feature-button" onClick={onOpen}>
        <SmartImage
          src={photo.src}
          thumb={photo.thumb}
          alt={`${photo.title}${photo.description ? ` — ${photo.description}` : ''}`}
          width={photo.width}
          height={photo.height}
          tone={photo.tone}
          sizes="(max-width: 1023px) 100vw, 66vw"
          className="photography__feature-image"
          failureLabel="作品文件未加载"
        />
        <span className="photography__zoom" aria-hidden="true">
          <Icon name="expand" size={16} />
        </span>
      </button>

      <div className="photography__feature-caption">
        <p className="u-label">
          作品 {String(index + 1).padStart(2, '0')}
        </p>
        <h3 className="photography__feature-title">{photo.title}</h3>
        <p className="photography__feature-desc">{photo.description}</p>
        <div className="row">
          <span className="badge">{PHOTO_CATEGORY_LABELS[photo.category]}</span>
          <ProvenanceBadge provenance={photo.provenance} />
        </div>
        <p className="photography__feature-dim u-mono">
          {photo.width} × {photo.height}
        </p>
      </div>
    </article>
  );
}

/** A flowing tile that keeps its own aspect ratio — never cropped to a grid. */
function FlowPhoto({ photo, index, onOpen }: { photo: Photo; index: number; onOpen: () => void }) {
  const reveal = useRevealOnView<HTMLLIElement>({ delay: Math.min(index, 6) * 50, threshold: 0.05 });

  return (
    <li
      ref={reveal.ref}
      className={`${reveal.className} photography__flow-item`}
      style={reveal.style}
      data-cursor="view"
    >
      <button type="button" className="photography__flow-button" onClick={onOpen}>
        <SmartImage
          src={photo.src}
          thumb={photo.thumb}
          alt={`${photo.title}${photo.description ? ` — ${photo.description}` : ''}`}
          width={photo.width}
          height={photo.height}
          tone={photo.tone}
          sizes="(max-width: 767px) 92vw, (max-width: 1279px) 46vw, 31vw"
          className="photography__flow-image"
          failureLabel="作品文件未加载"
        />

        <span className="photography__flow-overlay">
          <span className="photography__flow-title">{photo.title}</span>
          <span className="photography__flow-meta u-label">{PHOTO_CATEGORY_LABELS[photo.category]}</span>
        </span>

        <span className="photography__zoom photography__zoom--sm" aria-hidden="true">
          <Icon name="expand" size={14} />
        </span>
      </button>

      {photo.provenance === 'sample' ? (
        <span className="photography__flow-badge">
          <ProvenanceBadge provenance={photo.provenance} compact />
        </span>
      ) : null}
    </li>
  );
}
