/**
 * AboutPage — who this is, and what the space is for.
 *
 * Deliberately built from four interest blocks (from content) rather than a
 * biography, because there is no verified biography to write. There is no
 * timeline of achievements, no job history, no awards — inventing any of those
 * would be the single most damaging thing this project could do, since the whole
 * point is that what is here is true.
 *
 * What IS shown:
 *   • the statement and tagline, marked as positioning copy;
 *   • the four axes the site is organised around;
 *   • an honest inventory of what content exists and what is still empty;
 *   • the provenance of the supplied Logo, including the missing black version.
 */

import { Link } from 'react-router-dom';
import { BRAND, CONTENT_COUNTS, PROFILE, SETTINGS } from '@/content';
import { HOME_ROUTE, NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon, SceneIcon } from '@/components/ui/Icon';
import { Logo } from '@/components/brand/Logo';
import { BRAND_ASSETS, BRAND_PROVENANCE } from '@/components/brand/manifest';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRevealOnView } from '@/hooks/useRevealOnView';
import './about.css';

const aboutRoute = NAVIGABLE_ROUTES.find((r) => r.id === 'about')!;

export default function AboutPage() {
  useDocumentTitle({
    title: aboutRoute.title,
    description: aboutRoute.description,
    image: SETTINGS.ogImage,
    path: aboutRoute.path,
  });

  const inventory = [
    { id: 'photography', label: '摄影作品', count: CONTENT_COUNTS.photos, ready: CONTENT_COUNTS.photos > 0 },
    { id: 'riding', label: '摩旅路线', count: CONTENT_COUNTS.routes, ready: CONTENT_COUNTS.routes > 0 },
    { id: 'lab', label: '技术记录', count: CONTENT_COUNTS.labNotes, ready: CONTENT_COUNTS.labNotes > 0 },
    { id: 'projects', label: '个人项目', count: CONTENT_COUNTS.projects, ready: CONTENT_COUNTS.projects > 0 },
    { id: 'journal', label: '随笔', count: CONTENT_COUNTS.journal, ready: CONTENT_COUNTS.journal > 0 },
  ];

  return (
    <SceneLayout route={aboutRoute}>
      {/* ------------------------------------------------------- statement -- */}
      <section className="about__statement" aria-labelledby="about-statement">
        <h2 id="about-statement" className="visually-hidden">
          个人宣言
        </h2>
        <p className="about__lead">{BRAND.statement}</p>
        <p className="about__lead-en">{BRAND.statementEn}</p>
        <div className="about__tagline">
          <span className="about__tagline-rule" aria-hidden="true" />
          <p>{BRAND.tagline}</p>
          <p className="about__tagline-en">{BRAND.taglineEn}</p>
        </div>
      </section>

      {/* --------------------------------------------------------- four axes -- */}
      <section className="section" aria-labelledby="about-axes">
        <div className="section__head">
          <h2 id="about-axes" className="section__title">
            四条线索
          </h2>
          <p className="u-label">FOUR THREADS</p>
        </div>

        <ul className="about__threads">
          {PROFILE.map((block, i) => (
            <ThreadCard key={block.id} block={block} index={i} />
          ))}
        </ul>
      </section>

      {/* -------------------------------------------------------- inventory -- */}
      <section className="section" aria-labelledby="about-inventory">
        <div className="section__head">
          <h2 id="about-inventory" className="section__title">
            这个空间现在有什么
          </h2>
          <p className="u-label">CONTENT INVENTORY</p>
        </div>

        <p className="about__note">
          下面这些数字是实时从内容文件里读出来的，不是写死的装饰数字。它同时告诉你哪些板块已经可用，
          哪些还在等真实内容填进来。
        </p>

        <GlassSurface as="ul" tier="standard" className="about__inventory" radius="var(--r-lg)">
          {inventory.map((item) => {
            const route = NAVIGABLE_ROUTES.find((r) => r.id === item.id);
            return (
              <li key={item.id} className="about__inventory-item">
                <span className="about__inventory-icon" aria-hidden="true">
                  <SceneIcon scene={item.id} size={16} />
                </span>
                <span className="about__inventory-label">
                  {route ? (
                    <Link to={route.path} className="about__inventory-link">
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </span>
                <span className="about__inventory-count u-mono">{item.count}</span>
                <span className={`badge ${item.ready ? 'badge--accent' : 'badge--warn'}`}>
                  <span className="badge__dot" aria-hidden="true" />
                  {item.ready ? '可用' : '等待内容'}
                </span>
              </li>
            );
          })}
        </GlassSurface>
      </section>

      {/* ------------------------------------------------------- logo origin -- */}
      <section className="section" aria-labelledby="about-logo">
        <div className="section__head">
          <h2 id="about-logo" className="section__title">
            关于这个标识
          </h2>
          <p className="u-label">BRAND PROVENANCE</p>
        </div>

        <div className="about__logo-grid">
          <GlassSurface tier="standard" className="about__logo-demo" radius="var(--r-lg)">
            <Logo height={40} />
            <p className="u-label">浅色墨 · 深色背景</p>
          </GlassSurface>

          <GlassSurface
            tier="standard"
            solid
            className="about__logo-demo about__logo-demo--light"
            radius="var(--r-lg)"
          >
            <Logo ink="dark" height={40} />
            <p className="u-label">深色墨 · 浅色背景</p>
          </GlassSurface>
        </div>

        <div className="about__logo-notes">
          <p>
            你只提供了白色版本 <code>{BRAND_PROVENANCE.sourceFile}</code>，而且它是 JPEG——
            也就是说<b>没有透明通道</b>，画面是白色笔触落在纯白背景上（实测最暗像素亮度 151，
            99.5% 的像素落在 224–255 区间）。
          </p>
          <p>
            因此项目没有直接叠加这张图，而是把它的<b>亮度通道当作覆盖率蒙版</b>还原出来：
            <code>alpha = (白 − 亮度) / (白 − 最暗)</code>。笔画几何、手绘边缘抖动和原有抗锯齿
            全部保持原样，只重新确定了墨色，并做了一次光学校准（γ=0.40）让细线在小尺寸下仍然可辨。
          </p>
          <p className="about__warning">
            <Icon name="alert" size={14} />
            <span>
              <b>{BRAND_PROVENANCE.blackVersionNote}</b>
              磁盘上不存在名为 <code>水印黑.png</code> 的文件。页面上的深色版本是同蒙版的派生着色，
              属于替代方案，不能算作你提供的原始黑色标识。若要替换，把真实的
              <code>水印黑.png</code> 放入 <code>public/assets/brand/</code> 并重新运行资源脚本即可。
            </span>
          </p>
        </div>

        <dl className="about__specs">
          <div>
            <dt className="u-label">源文件</dt>
            <dd className="u-mono">{BRAND_PROVENANCE.sourceFile}</dd>
          </div>
          <div>
            <dt className="u-label">格式 / 尺寸</dt>
            <dd className="u-mono">
              {BRAND_PROVENANCE.sourceFormat} · {BRAND_PROVENANCE.sourceSize}
            </dd>
          </div>
          <div>
            <dt className="u-label">内容边界</dt>
            <dd className="u-mono">{BRAND_PROVENANCE.artworkBox}</dd>
          </div>
          <div>
            <dt className="u-label">输出</dt>
            <dd className="u-mono">
              {BRAND_ASSETS.light.width}×{BRAND_ASSETS.light.height} RGBA
            </dd>
          </div>
        </dl>
      </section>

      {/* ----------------------------------------------------------- privacy -- */}
      <section className="section" aria-labelledby="about-privacy">
        <div className="section__head">
          <h2 id="about-privacy" className="section__title">
            隐私与内容原则
          </h2>
          <p className="u-label">PRINCIPLES</p>
        </div>
        <ul className="about__principles">
          <li>
            <Icon name="check" size={15} />
            <span>只使用昵称「{BRAND.nickname}」，不公开真实姓名、手机号、住址等敏感信息。</span>
          </li>
          <li>
            <Icon name="check" size={15} />
            <span>示例内容一律带「示例 / SAMPLE」标记，不会被伪装成真实经历或作品。</span>
          </li>
          <li>
            <Icon name="check" size={15} />
            <span>未提供的链接、账号与参数一律显示为「待填写」，不会生成看起来合理但不存在的内容。</span>
          </li>
          <li>
            <Icon name="check" size={15} />
            <span>不虚构获奖、资历、里程、设备或拍摄数据；EXIF 字段在真实信息为空时不显示。</span>
          </li>
        </ul>
      </section>

      <div className="about__back">
        <Link to={HOME_ROUTE.path} className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>
    </SceneLayout>
  );
}

/* ------------------------------------------------------------------------ */

function ThreadCard({
  block,
  index,
}: {
  block: (typeof PROFILE)[number];
  index: number;
}) {
  const reveal = useRevealOnView<HTMLLIElement>({ delay: index * 70 });

  return (
    <li ref={reveal.ref} className={`${reveal.className} about__thread`} style={reveal.style}>
      <GlassSurface tier="depth" className="about__thread-glass" radius="var(--r-xl)">
        <div className="about__thread-head">
          <span className="about__thread-icon" aria-hidden="true">
            <SceneIcon scene={block.id} size={20} />
          </span>
          <span className="about__thread-index u-mono">{String(index + 1).padStart(2, '0')}</span>
        </div>

        <h3 className="about__thread-title">{block.title}</h3>
        <p className="about__thread-en u-label">{block.titleEn}</p>
        <p className="about__thread-body">{block.body}</p>

        {block.note ? <p className="about__thread-note">{block.note}</p> : null}

        <ProvenanceBadge provenance={block.provenance} />
      </GlassSurface>
    </li>
  );
}
