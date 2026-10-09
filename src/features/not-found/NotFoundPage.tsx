/**
 * NotFoundPage — the unknown-route handler.
 *
 * A dead end is a failure of navigation, so this page is not purely an apology:
 * it lists the complete scene index, offers a search over the content it can
 * actually reach, and explains the one situation that produces a 404 on a static
 * host even when the route is valid (a deep link before the 404 fallback has
 * rewritten it — see public/404.html).
 */

import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAVIGABLE_ROUTES, HOME_ROUTE } from '@/app/routes';
import { PHOTOS, PROJECTS, JOURNAL, LAB_NOTES, SETTINGS } from '@/content';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon, SceneIcon } from '@/components/ui/Icon';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import './not-found.css';

interface Hit {
  id: string;
  label: string;
  scene: string;
  to: string;
  detail: string;
}

export function NotFoundPage() {
  const { pathname } = useLocation();
  const [query, setQuery] = useState('');

  useDocumentTitle({
    /* The title is built as `${title} · ${SITE_TITLE_SUFFIX}`. Since the suffix
       already names the site, adding "页面未找到" as the prefix is what yields
       "页面未找到 · 汤圆Vision" — correct, but easy to mistake
       for a doubling. Kept explicit rather than left to look accidental. */
    title: '页面未找到',
    description: '这个地址没有对应的页面。下面是完整的空间索引。',
    path: pathname,
    noindex: true,
  });

  /**
   * A local index over the loaded content. Building it in memory rather than
   * shipping a search service keeps the site static — the tradeoff is that it
   * only covers what has already been bundled, which is stated in the UI.
   */
  const index = useMemo<Hit[]>(
    () => [
      ...NAVIGABLE_ROUTES.map((r) => ({
        id: `scene-${r.id}`,
        label: r.label,
        scene: r.id,
        to: r.path,
        detail: r.blurb,
      })),
      ...PHOTOS.map((p) => ({
        id: `photo-${p.id}`,
        label: p.title,
        scene: 'photography',
        to: `/photography#${p.id}`,
        detail: p.description.slice(0, 60),
      })),
      ...PROJECTS.map((p) => ({
        id: `project-${p.id}`,
        label: p.name,
        scene: 'projects',
        to: '/projects',
        detail: p.summary.slice(0, 60),
      })),
      ...JOURNAL.map((e) => ({
        id: `journal-${e.id}`,
        label: e.title,
        scene: 'journal',
        to: '/journal',
        detail: e.excerpt.slice(0, 60),
      })),
      ...LAB_NOTES.map((n) => ({
        id: `lab-${n.id}`,
        label: n.title,
        scene: 'lab',
        to: '/lab',
        detail: n.question.slice(0, 60),
      })),
    ],
    []
  );

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return index
      .filter((h) => h.label.toLowerCase().includes(q) || h.detail.toLowerCase().includes(q))
      .slice(0, 8);
  }, [index, query]);

  return (
    <div className="scene notfound" data-scene="home">
      <div className="scene-ambient" aria-hidden="true" />
      <div className="scene__grain" aria-hidden="true" />

      <main className="notfound__main">
        <div className="u-shell">
          <div className="notfound__hero">
            <p className="notfound__code u-mono" aria-hidden="true">
              404
            </p>

            <h1 className="notfound__title">这个地址没有对应的页面</h1>

            <p className="notfound__body">
              你可能是手动输入了地址，或者点到了一个已经改过的链接。
              当前路径：<code>{pathname}</code>
            </p>
          </div>

          {/* -------------------------------------------------------- search -- */}
          <GlassSurface tier="depth" className="notfound__search" radius="var(--r-xl)">
            <label className="notfound__search-label" htmlFor="notfound-q">
              在站内内容里查找
            </label>
            <div className="notfound__search-row">
              <Icon name="sparkle" size={16} />
              <input
                id="notfound-q"
                type="search"
                value={query}
                placeholder="输入关键词，例如「摄影」「路线」…"
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>

            {query.trim().length >= 2 ? (
              hits.length > 0 ? (
                <ul className="notfound__hits">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <Link to={hit.to} className="notfound__hit">
                        <span className="notfound__hit-icon" aria-hidden="true">
                          <SceneIcon scene={hit.scene} size={15} />
                        </span>
                        <span className="notfound__hit-body">
                          <span className="notfound__hit-label">{hit.label}</span>
                          {hit.detail ? (
                            <span className="notfound__hit-detail">{hit.detail}</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="notfound__no-hits">
                  没有匹配的内容。这个检索只覆盖已经加载到页面里的内容文件，
                  不联网、也不索引站外地址。
                </p>
              )
            ) : (
              <p className="notfound__search-hint">
                输入至少两个字符开始查找。检索在本地完成，不会发送任何请求。
              </p>
            )}
          </GlassSurface>

          {/* ---------------------------------------------- conventional index -- */}
          <section className="notfound__index" aria-labelledby="notfound-index">
            <h2 id="notfound-index" className="u-label">
              完整空间索引 / ALL DESTINATIONS
            </h2>

            <ul className="notfound__index-list">
              <li>
                <Link to={HOME_ROUTE.path} className="notfound__index-link">
                  <SceneIcon scene="home" size={17} />
                  <span>{HOME_ROUTE.label}</span>
                  <span className="notfound__index-en u-label">{HOME_ROUTE.labelEn}</span>
                </Link>
              </li>

              {NAVIGABLE_ROUTES.map((r) => (
                <li key={r.id}>
                  <Link to={r.path} className="notfound__index-link">
                    <SceneIcon scene={r.id} size={17} />
                    <span>{r.label}</span>
                    <span className="notfound__index-en u-label">{r.labelEn}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* --------------------------------------------------------- why -- */}
          <GlassSurface tier="standard" className="notfound__explain" radius="var(--r-lg)">
            <h2 className="notfound__explain-title">
              <Icon name="alert" size={15} />
              如果这个地址其实是对的
            </h2>
            <p>
              本站部署在 GitHub Pages 上，它是一个纯静态主机：服务器并不知道任何子路径对应哪个
              文件。项目为此提供了 <code>public/404.html</code> 深层链接回退——
              它会把浏览器请求的路径转写成查询参数，再由入口页面还原成正确的路由。
            </p>
            <p>
              如果你在部署后刷新深层页面时看到了这个页面，说明回退文件没有被正确发布。
              检查方法：<code>dist/404.html</code> 是否存在，以及 GitHub Pages 是否从
              <code>gh-pages</code> 分支（或 Actions 的 artifact）发布。
              完整排查步骤见 <code>docs/DEPLOYMENT.md</code>。
            </p>
            <p className="notfound__explain-meta u-label">
              {SETTINGS.siteTitle} · STATIC HOST · CLIENT-SIDE ROUTING
            </p>
          </GlassSurface>
        </div>
      </main>
    </div>
  );
}
