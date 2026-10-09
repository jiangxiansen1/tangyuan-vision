/**
 * ProvenanceBadge — the honesty marker.
 *
 * Any content record whose `provenance` is 'sample' gets a visible marker
 * wherever it is presented as content. This is the mechanism that satisfies the
 * brief's requirement that placeholder material can never be mistaken for the
 * author's real experience: it is not a footnote in the docs, it is on the item.
 */

import { Icon } from './Icon';
import './provenance.css';

export interface ProvenanceBadgeProps {
  provenance: 'sample' | 'real';
  /** Overrides the default Chinese label. */
  label?: string;
  /** Compact form for dense grids. */
  compact?: boolean;
}

export function ProvenanceBadge({ provenance, label, compact = false }: ProvenanceBadgeProps) {
  if (provenance === 'real') return null;

  return (
    <span
      className={`provenance ${compact ? 'provenance--compact' : ''}`}
      /* The marker is text, so it is announced. The icon beside it is not. */
      title="示例内容：用于展示版式与交互，并非作者的真实经历或作品"
    >
      <Icon name="sparkle" size={compact ? 10 : 12} />
      <span>{label ?? '示例 / SAMPLE'}</span>
    </span>
  );
}

/**
 * PendingMarker — shown wherever an optional field the author must supply is
 * empty. We never invent a plausible-looking URL or handle, so the UI states
 * plainly that the value is missing.
 */
export function PendingMarker({ label = '待填写 / TBD' }: { label?: string }) {
  return (
    <span className="pending" title="这个字段还没有填写真实内容——本站不会生成看起来合理但不存在的地址或账号">
      <Icon name="alert" size={12} />
      <span>{label}</span>
    </span>
  );
}
