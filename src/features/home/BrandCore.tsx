/**
 * BrandCore — the visual centre of the home page.
 *
 * TYPOGRAPHY IS THE DESIGN HERE
 * The brand is 「汤圆Vision」 — a Chinese word bound directly to an English word,
 * with 「汤圆视界」 as its Chinese gloss. That lockup has one job: be the most
 * memorable thing on the page. So the treatment is deliberately about contrast
 * between a heavy Chinese face and a light Latin face, at a scale nothing else
 * on the page competes with:
 *
 *   汤圆   Chinese, medium weight, tight tracking — reads as a solid mark
 *   Vision  Latin, light weight, tighter tracking — reads as air next to it
 *
 * The two sit on one baseline with no space between them, because a space would
 * make them two words instead of one name.
 *
 * WHAT THIS COMPONENT DELIBERATELY DOES NOT DO
 *   • No glass panel around the lockup. The brief rules it out, and it is right
 *     to: a card around the wordmark makes it a component instead of a statement.
 *   • No romanisation. "TangyuanVision" never appears.
 *   • No fixed font size. The scale is fluid and the line is measured, so the
 *     lockup neither wraps mid-word on a phone nor overflows a wide desktop.
 *
 * Legibility over a photograph is handled by the layer behind this — see
 * VisionBackdrop — rather than by a panel drawn here.
 */

import { BRAND } from '@/content';
import './brand-core.css';

export interface BrandCoreProps {
  /** 'full' is the home hero; 'compact' is used in the boot hand-off. */
  variant?: 'full' | 'compact';
  className?: string;
}

export function BrandCore({ variant = 'full', className }: BrandCoreProps) {
  return (
    <div className={`bcore bcore--${variant} ${className ?? ''}`}>
      {/*
        h1: the accessible name is the full brand read once, so a screen reader
        announces 「汤圆Vision」 as a single name rather than two stray fragments.
        The visible spans are aria-hidden because the h1 text already contains
        them — otherwise they would be read twice.
      */}
      <h1 className="bcore__lockup">
        <span className="visually-hidden">
          {BRAND.brandFull}，{BRAND.brandGloss}
        </span>
        <span className="bcore__pair" aria-hidden="true">
          <span className="bcore__cn">{BRAND.nickname}</span>
          <span className="bcore__latin">{BRAND.brandLatin}</span>
        </span>
      </h1>

      {/* The Chinese gloss. Required by the brief, not decorative — so it gets
          real presence (a rule above it, its own size) rather than being set as
          a caption that could be mistaken for metadata. */}
      <p className="bcore__gloss">
        <span className="bcore__gloss-rule" aria-hidden="true" />
        <span className="bcore__gloss-text">{BRAND.brandGloss}</span>
      </p>

      <p className="bcore__tagline-en">{BRAND.taglineEn}</p>
      <p className="bcore__tagline">{BRAND.tagline}</p>

      {/*
        个人宣言。唯一真源是 CMS 的 brand.statement（src/content/data/brand.json），
        经 src/content/index.ts 的 BRAND 读取；这里不复制任何文案常量。
        只在 full 变体渲染——compact 用于 boot 交接，保持极简。
      */}
      {variant === 'full' && BRAND.statement ? (
        <p className="bcore__statement">{BRAND.statement.trim()}</p>
      ) : null}
    </div>
  );
}
