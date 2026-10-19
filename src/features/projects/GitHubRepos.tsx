/**
 * GitHubRepos — the visitor's public repositories, read from the GitHub API.
 *
 * WHY THE LIVE API AND NOT A GENERATED FILE
 * A build-time snapshot would mean the list is only as fresh as the last deploy, and
 * the deploy is triggered by this same repository — so adding a new repo elsewhere
 * would never appear until something else was pushed. Reading the API means the
 * projects page is correct the moment the repo is created.
 *
 * The cost is the unauthenticated rate limit (60 requests/hour per IP). A personal
 * site will not approach it, and the response is cached for five minutes anyway, so a
 * single visitor browsing back and forth costs one request.
 *
 * WHAT HAPPENS WHEN IT FAILS
 * Rate limited, offline, GitHub down: the section says so and offers the profile link.
 * It never renders an empty box, and it never substitutes invented repositories.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface Repo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  updated_at: string;
  homepage: string | null;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; repos: Repo[] }
  | { status: 'error'; reason: string };

const USER = 'jiangxiansen1';
const CACHE_KEY = `gh-repos:${USER}`;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Cached {
  at: number;
  repos: Repo[];
}

/** Language → a dot colour, so the list reads at a glance. Unknown languages stay grey. */
const LANGUAGE_COLOUR: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  Go: '#00ADD8',
  Vue: '#41b883',
  Shell: '#89e051',
};

function readCache(): Repo[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || !Array.isArray(parsed.repos)) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.repos;
  } catch {
    return null;
  }
}

function writeCache(repos: Repo[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), repos }));
  } catch {
    /* private mode or quota: the page works without a cache */
  }
}

/** "2 小时前" / "3 天前" — dates are friendlier than ISO strings here. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const hours = Math.max(1, Math.round((Date.now() - then) / 3_600_000));
  if (hours < 24) return `${hours} 小时前更新`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前更新`;
  const months = Math.round(days / 30);
  return `${months} 个月前更新`;
}

export function GitHubRepos() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setState({ status: 'ready', repos: cached });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    // The API is normally fast; a hung request must not leave the section spinning.
    const timer = window.setTimeout(() => controller.abort(), 12_000);

    void fetch(`https://api.github.com/users/${USER}/repos?sort=updated&per_page=20`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(res.status === 403 ? '请求太频繁' : `HTTP ${res.status}`);
        }
        return (await res.json()) as Repo[];
      })
      .then((repos) => {
        if (cancelled) return;
        const visible = repos.filter((r) => !r.archived);
        writeCache(visible);
        setState({ status: 'ready', repos: visible });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : '网络不通';
        setState({ status: 'error', reason });
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <section className="ghrepo" aria-labelledby="ghrepo-title">
      <div className="ghrepo__head">
        <h2 id="ghrepo-title" className="u-label">
          GitHub 仓库
        </h2>
        <a className="ghrepo__profile" href={`https://github.com/${USER}`} target="_blank" rel="noreferrer noopener">
          全部仓库
          <Icon name="arrow-out" size={13} />
        </a>
      </div>

      {state.status === 'loading' ? (
        <p className="ghrepo__note">正在读取…</p>
      ) : state.status === 'error' ? (
        <p className="ghrepo__note">
          暂时读不到仓库列表（{state.reason}）。可以直接去{' '}
          <a href={`https://github.com/${USER}`} target="_blank" rel="noreferrer noopener">
            github.com/{USER}
          </a>{' '}
          看。
        </p>
      ) : state.repos.length === 0 ? (
        <p className="ghrepo__note">还没有公开仓库。</p>
      ) : (
        <ul className="ghrepo__list">
          {state.repos.map((repo) => (
            <li key={repo.id} className="ghrepo__item">
              <a className="ghrepo__link" href={repo.html_url} target="_blank" rel="noreferrer noopener">
                <span className="ghrepo__name">
                  {repo.name}
                  {repo.fork ? <span className="ghrepo__badge">fork</span> : null}
                </span>
                <Icon name="arrow-out" size={13} />
              </a>
              {repo.description ? (
                <p className="ghrepo__desc">{repo.description}</p>
              ) : (
                <p className="ghrepo__desc ghrepo__desc--empty">没有写描述</p>
              )}
              <p className="ghrepo__meta">
                {repo.language ? (
                  <span className="ghrepo__lang">
                    <span
                      className="ghrepo__dot"
                      style={{ background: LANGUAGE_COLOUR[repo.language] ?? '#7c8796' }}
                      aria-hidden="true"
                    />
                    {repo.language}
                  </span>
                ) : null}
                {repo.stargazers_count > 0 ? <span>★ {repo.stargazers_count}</span> : null}
                <span>{relativeTime(repo.updated_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
