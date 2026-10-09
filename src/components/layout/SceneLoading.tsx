/**
 * SceneLoading — the suspense fallback between scene chunks.
 *
 * Deliberately not a spinner. A spinner on a dark cinematic layout looks like a
 * broken video player; a quiet skeleton in the scene's own palette looks like the
 * page arriving. It also has a fixed height so the swap does not shift anything.
 *
 * The visible text is real information rather than decoration: it states that a
 * chunk is being fetched, which is genuinely what is happening.
 */

import './scene-loading.css';

export function SceneLoading({ label }: { label?: string }) {
  return (
    <div className="scene scene-loading" role="status" aria-live="polite">
      <div className="scene-ambient" aria-hidden="true" />
      <div className="scene__grain" aria-hidden="true" />

      <div className="scene-loading__inner" style={{ paddingTop: 'var(--page-top)' }}>
        <div className="u-shell">
          <p className="scene-loading__label u-label">
            {label ?? '正在载入场景 / LOADING SCENE'}
          </p>

          {/* A skeleton mirroring the real scene header, so nothing jumps when the
              chunk resolves. */}
          <div className="scene-loading__skeleton" aria-hidden="true">
            <span className="scene-loading__bar scene-loading__bar--eyebrow shimmer" />
            <span className="scene-loading__bar scene-loading__bar--title shimmer" />
            <span className="scene-loading__bar scene-loading__bar--sub shimmer" />
            <div className="scene-loading__grid">
              <span className="shimmer" />
              <span className="shimmer" />
              <span className="shimmer" />
            </div>
          </div>

          <span className="visually-hidden">
            正在加载页面内容，请稍候。如果长时间没有变化，可能是网络无法获取该页面的代码分块。
          </span>
        </div>
      </div>
    </div>
  );
}
