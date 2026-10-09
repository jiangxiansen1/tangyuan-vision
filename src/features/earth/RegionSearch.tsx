/**
 * RegionSearch — the region list, collapsed into a search entry.
 *
 * WHY THE LIST WENT AWAY AND THIS DID NOT
 * The page used to carry a permanent grid of all 174 regions under the globe. It
 * worked, and it fought the page: a visitor arriving at a dark globe surrounded by
 * particles was being asked to scroll past a spreadsheet, and the immersive
 * transition into this page ended in a list.
 *
 * But the list was also doing two jobs that had to survive its removal:
 *
 *   1. KEYBOARD ACCESS — every region was reachable and focusable by keyboard. A
 *      globe you can only drag is unreachable without a pointer.
 *   2. SEARCH — finding a specific country by scrolling is bad, but finding it
 *      without any way to name it is worse.
 *
 * So the same data is still here, still keyboard reachable, still complete — it just
 * does not occupy the page until asked for. The trigger is a small floating pill; the
 * panel is a normal dialog with a text input, and the list is virtual-free because
 * 174 rows render instantly.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not fabricate or hide visit status. A region with no travel record reads
 * 尚未记录, exactly as the old list did, because the honesty of that field is the
 * whole point of the page.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GeoIndex } from './geo-index';
import { regionLabel, travelFor } from './regions';
import './region-search.css';

export interface RegionSearchProps {
  geoIndex: GeoIndex | null;
  selectedId: string | null;
  onSelect: (regionId: string) => void;
}

type Filter = 'all' | 'visited' | 'planned' | 'unrecorded';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'visited', label: '已到访' },
  { id: 'planned', label: '计划中' },
  { id: 'unrecorded', label: '尚未记录' },
];

export function RegionSearch({ geoIndex, selectedId, onSelect }: RegionSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* Sorted once, not per keystroke: `regionLabel` does a locale compare against a
     Chinese collation, and running that over 174 rows on every character typed is
     visible on a slow machine. */
  const rows = useMemo(() => {
    if (!geoIndex) return [];
    return [...geoIndex.regions]
      .map((r) => ({
        id: r.id,
        nameEn: r.nameEn,
        label: regionLabel(r.id, r.nameEn),
        status: travelFor(r.id).status,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  }, [geoIndex]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      // Match the Chinese label OR the English name, so both 日本 and Japan work.
      return r.label.toLowerCase().includes(q) || r.nameEn.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  useEffect(() => {
    if (open) {
      // Focus the input, not the panel: the visitor opened this to type.
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /* Close on a click outside. Registered on the next frame so the click that OPENED
     the panel does not immediately close it. */
  useEffect(() => {
    if (!open) return;
    let handler: ((e: PointerEvent) => void) | null = null;
    const id = requestAnimationFrame(() => {
      handler = (e: PointerEvent) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('pointerdown', handler);
    });
    return () => {
      cancelAnimationFrame(id);
      if (handler) document.removeEventListener('pointerdown', handler);
    };
  }, [open]);

  return (
    <div className="rsearch" ref={panelRef}>
      <button
        type="button"
        className="rsearch__trigger"
        aria-expanded={open}
        aria-controls="region-search-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="location" size={14} />
        <span>查找地区</span>
        <span className="rsearch__count u-mono">{rows.length}</span>
      </button>

      {open ? (
        <div className="rsearch__panel" id="region-search-panel" role="dialog" aria-label="查找地区与地区">
          <div className="rsearch__field">
            <Icon name="location" size={14} />
            <input
              ref={inputRef}
              type="search"
              className="rsearch__input"
              placeholder="输入国家或地区名，例如 日本 / Japan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="按名称搜索国家或地区"
            />
            <button
              type="button"
              className="rsearch__close"
              onClick={() => setOpen(false)}
              aria-label="关闭搜索"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="rsearch__filters" role="group" aria-label="按旅行状态筛选">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="rsearch__filter"
                data-active={filter === f.id}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {matched.length === 0 ? (
            <p className="rsearch__empty">
              没有匹配的地区。地球仍然可以旋转与缩放，也可以直接点击地表上的国家。
            </p>
          ) : (
            <ul className="rsearch__list">
              {matched.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="rsearch__item"
                    data-status={r.status}
                    aria-current={selectedId === r.id ? 'true' : undefined}
                    onClick={() => {
                      onSelect(r.id);
                      setOpen(false);
                    }}
                  >
                    <span className="rsearch__dot" aria-hidden="true" />
                    <span className="rsearch__name">{r.label}</span>
                    <span className="rsearch__name-en">{r.nameEn}</span>
                    <span className="rsearch__tag">
                      {r.status === 'visited'
                        ? '已到访'
                        : r.status === 'planned'
                          ? '计划中'
                          : '尚未记录'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="rsearch__note">
            中文名来自数据源中已有的条目，其余保留英文原名——没有做机器翻译，
            因为一个错误的中文名比一个正确的英文名更糟。
          </p>
        </div>
      ) : null}
    </div>
  );
}
