/**
 * RegionPanel — what you see after clicking a country.
 *
 * THE RULE THIS COMPONENT EXISTS TO ENFORCE
 * There are three completely different things a country on this globe can be, and
 * they must never be blurred together:
 *
 *   VISITED     the author recorded a real trip. Show the record — dates, story,
 *               photos — and nothing that was not supplied.
 *   PLANNED     the author intends to go. Say so.
 *   UNRECORDED  the author has no record. Say THAT, in plain words, and offer the
 *               visitor something real to do: vote "I want to go too".
 *
 * The failure mode being avoided is a country panel that looks equally full for
 * all three, which quietly implies a trip that never happened. So the unrecorded
 * branch leads with the fact rather than with filler prose.
 *
 * The vote count is NEVER invented. When the shared database is not configured,
 * the panel says so and the button explains why it is unavailable — the count
 * field is not rendered with a zero, because a zero is a claim.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ProvenanceBadge } from '@/components/ui/ProvenanceBadge';
import { travelFor } from './regions';
import type { RegionShape } from './geo-index';
import { approximateLocalTime, isDaylight } from './solar';
import './region-panel.css';

/**
 * The vote state this panel renders.
 *
 * `count` is `number | null`, and the distinction is the whole point:
 *   • a number, including 0, means the backend genuinely reported that value
 *   • null means the value could NOT be read — the write landed but the read-back
 *     failed, or the request errored — and the UI must show a dash rather than
 *     guessing. A fabricated 0 is a claim about data the site does not have.
 */
export interface RegionVoteState {
  count: number | null;
  voted: boolean;
  pending?: boolean;
  error?: string | null;
  /** True when the numbers come from the local DEMO backend, not a real one. */
  demo?: boolean;
}

export interface RegionPanelProps {
  region: RegionShape;
  /** Chinese label resolved by the caller, so this component does not re-derive it. */
  label: string;
  /** Photography lookup, so a visited region can show its own photos. */
  photosById: Map<string, { src: string; thumb?: string; title: string; width: number; height: number; tone: string }>;
  /** Vote state for this region, or null when the backend is unavailable. */
  vote: RegionVoteState | null;
  onVote: () => void;
  onClose: () => void;
}

export function RegionPanel({ region, label, photosById, vote, onVote, onClose }: RegionPanelProps) {
  const travel = travelFor(region.id);
  const panelRef = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => new Date());

  /**
   * A once-a-minute clock, for the local-time and daylight readout.
   *
   * Deliberately not per-second: the readout shows HH:MM, and re-rendering a
   * panel with a photo grid every second to change nothing visible would be
   * wasteful. The interval is cleared on unmount.
   */
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /** Escape closes, and focus returns to the globe's keyboard surface. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const daylight = isDaylight(region.center.lat, region.center.lon, now);

  const statusMeta = {
    visited: { label: '已到访', tone: 'visited' as const },
    planned: { label: '计划中', tone: 'planned' as const },
    unrecorded: { label: '尚未记录', tone: 'unrecorded' as const },
  }[travel.status];

  const photos = (travel.photoIds ?? [])
    .map((id) => photosById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <aside
      ref={panelRef}
      className="rpanel"
      data-status={travel.status}
      role="dialog"
      aria-modal={false}
      aria-labelledby="rpanel-title"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header className="rpanel__head">
        <div className="rpanel__head-main">
          <p className="rpanel__eyebrow u-label">
            <Icon name="location" size={13} />
            {region.nameEn}
          </p>
          <h2 id="rpanel-title" className="rpanel__title">
            {label}
          </h2>
        </div>

        <button type="button" className="rpanel__close" onClick={onClose} aria-label="关闭地区详情">
          <Icon name="close" size={16} />
        </button>
      </header>

      {/* ------------------------------------------------------- status bar -- */}
      <div className="rpanel__status" data-tone={statusMeta.tone}>
        <span className="rpanel__status-dot" aria-hidden="true" />
        <span className="rpanel__status-label">{statusMeta.label}</span>
        {travel.status === 'visited' && travel.visitedAt ? (
          <span className="rpanel__status-date u-mono">{travel.visitedAt}</span>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- the facts -- */}
      <dl className="rpanel__facts">
        <div>
          <dt className="u-label">所在纬度</dt>
          <dd className="u-mono">
            {Math.abs(region.center.lat).toFixed(1)}°{region.center.lat >= 0 ? 'N' : 'S'}
          </dd>
        </div>
        <div>
          <dt className="u-label">所在经度</dt>
          <dd className="u-mono">
            {Math.abs(region.center.lon).toFixed(1)}°{region.center.lon >= 0 ? 'E' : 'W'}
          </dd>
        </div>
        <div>
          <dt className="u-label">当地时间</dt>
          <dd className="u-mono">{approximateLocalTime(region.center.lon, now)}</dd>
        </div>
        <div>
          <dt className="u-label">此刻</dt>
          <dd>{daylight ? '白昼' : '夜间'}</dd>
        </div>
      </dl>
      <p className="rpanel__fact-note">
        当地时间按经度推算，是平均太阳时，不等于该国实际使用的法定时区。
      </p>

      {/* ===================================================== VISITED ==== */}
      {travel.status === 'visited' ? (
        <section className="rpanel__section" aria-labelledby="rpanel-visited">
          <h3 id="rpanel-visited" className="u-label">
            旅行记录
          </h3>

          {travel.title ? <p className="rpanel__entry-title">{travel.title}</p> : null}

          {travel.story ? (
            <div className="rpanel__story u-prose">
              {travel.story.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            <p className="rpanel__missing">这次旅行还没有写下正文。</p>
          )}

          {photos.length > 0 ? (
            <ul className="rpanel__photos">
              {photos.map((photo) => (
                <li key={photo.src}>
                  <img
                    src={photo.src}
                    alt={photo.title}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rpanel__missing">这次旅行还没有关联照片。</p>
          )}

          {travel.latitude !== undefined && travel.longitude !== undefined ? (
            <p className="rpanel__coord u-mono">
              记录坐标 {travel.latitude.toFixed(4)}, {travel.longitude.toFixed(4)}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ===================================================== PLANNED ==== */}
      {travel.status === 'planned' ? (
        <section className="rpanel__section" aria-labelledby="rpanel-planned">
          <h3 id="rpanel-planned" className="u-label">
            计划
          </h3>
          <p className="rpanel__body">
            {travel.story ||
              '这里被标记为「计划中」：有去的打算，但还没有成行。所以下面没有旅行记录——计划不等于经历。'}
          </p>
        </section>
      ) : null}

      {/* ================================================== UNRECORDED ==== */}
      {travel.status === 'unrecorded' ? (
        <section className="rpanel__section" aria-labelledby="rpanel-unrecorded">
          <h3 id="rpanel-unrecorded" className="u-label">
            旅行记录
          </h3>
          <p className="rpanel__body rpanel__body--empty">
            我还没有去过这里，因此这里没有任何旅行记录、日期、路线或照片。
            这个空白是准确的——它不代表我忘了填，而是代表事情还没发生。
          </p>
        </section>
      ) : null}

      {/* ======================================================= VOTING ==== */}
      <section className="rpanel__section rpanel__vote" aria-labelledby="rpanel-vote">
        <h3 id="rpanel-vote" className="u-label">
          我也想去
        </h3>

        {vote === null ? (
          /* The backend is not configured. Say so, and do not render a count —
             a zero here would be a fabricated number. */
          <div className="rpanel__vote-unavailable">
            <Icon name="alert" size={15} />
            <div>
              <p className="rpanel__vote-unavailable-title">共享投票暂不可用</p>
              <p className="rpanel__vote-unavailable-body">
                投票需要连接到共享数据库，当前站点没有配置。所以在拿到真实数据之前，
                这里不显示任何票数——显示一个「0」或随机数字都是在编造。
              </p>
            </div>
          </div>
        ) : (
          <div className="rpanel__vote-body">
            <div className="rpanel__vote-count">
              <span className="rpanel__vote-number">{vote.count}</span>
              <span className="rpanel__vote-unit">人表示想去</span>
            </div>

            <button
              type="button"
              className="rpanel__vote-btn"
              onClick={onVote}
              aria-pressed={vote.voted}
              disabled={vote.pending}
              data-voted={vote.voted || undefined}
            >
              <Icon name={vote.voted ? 'check' : 'sparkle'} size={16} />
              <span>
                {vote.pending ? '提交中…' : vote.voted ? '已投票' : '我也想去'}
              </span>
            </button>

            {vote.error ? (
              <p className="rpanel__vote-error" role="alert">
                <Icon name="alert" size={14} />
                {vote.error}
              </p>
            ) : null}

            {vote.demo ? (
              <p className="rpanel__vote-demo">
                <span className="badge badge--warn">DEMO</span>
                这是本地演示数据，只存在于这个浏览器会话中，刷新即消失。
              </p>
            ) : null}

            <p className="rpanel__vote-note">
              匿名投票按浏览器标识去重，清除站点数据后可以重复投。这是匿名投票的固有限制，
              不是承诺不可绕过的验证。
            </p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------- provenance note -- */}
      {travel.status !== 'unrecorded' ? (
        <footer className="rpanel__foot">
          <ProvenanceBadge provenance="sample" />
          <p className="rpanel__foot-note">
            这条记录来自内容文件，可以在后台 CMS 的「地球与旅行」中修改。
          </p>
        </footer>
      ) : null}
    </aside>
  );
}
