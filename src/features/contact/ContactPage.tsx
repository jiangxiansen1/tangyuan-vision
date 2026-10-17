/**
 * ContactPage — where to reach the author.
 *
 * THE FORM QUESTION, RESOLVED HONESTLY
 * The brief forbids a form that pretends to have sent something when there is no
 * backend. This is a static site on GitHub Pages with no server, so there is no
 * form. Instead the page:
 *   • explains why there is no form,
 *   • uses a mailto: link with a prefilled subject when an email exists —
 *     which genuinely works with no backend,
 *   • offers a "copy address" action for when mailto is unhelpful,
 *   • and shows "待填写" for every channel the author has not supplied.
 *
 * No address, handle or profile URL is invented anywhere on this page.
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, CONTACT_CHANNELS, CONTACT_FORM_NOTE, CONTACT_PRIVACY_NOTE, SETTINGS } from '@/content';
import { NAVIGABLE_ROUTES } from '@/app/routes';
import { SceneLayout } from '@/components/layout/SceneLayout';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { PendingMarker } from '@/components/ui/ProvenanceBadge';
import { Logo } from '@/components/brand/Logo';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUIStore } from '@/store/useUIStore';
import { playSfx } from '@/store/useSoundStore';
import './contact.css';

const route = NAVIGABLE_ROUTES.find((r) => r.id === 'contact')!;

/* The only three channels this site offers. Douyin → video, Email → signal,
   GitHub → external arrow. Data lives in src/content/data/contact.json. */
const CHANNEL_ICON: Record<string, 'signal' | 'arrow-out' | 'video'> = {
  douyin: 'video',
  email: 'signal',
  github: 'arrow-out',
};

export default function ContactPage() {
  useDocumentTitle({
    title: route.title,
    description: route.description,
    image: SETTINGS.ogImage,
    path: route.path,
  });

  const pushToast = useUIStore((s) => s.pushToast);
  const [copied, setCopied] = useState<string | null>(null);

  const email = CONTACT_CHANNELS.find((c) => c.id === 'email' && c.handle);
  const confirmed = CONTACT_CHANNELS.filter((c) => c.confirmed && (c.url || c.handle));
  const pending = CONTACT_CHANNELS.filter((c) => !confirmed.includes(c));

  /**
   * Copy-to-clipboard, with the failure path handled. `navigator.clipboard` is
   * unavailable on insecure origins and in some embedded browsers, so the
   * fallback uses a temporary textarea and reports if that also fails.
   */
  const copy = useCallback(
    async (value: string, id: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const ta = document.createElement('textarea');
          ta.value = value;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          if (!ok) throw new Error('execCommand refused');
        }
        setCopied(id);
        playSfx('select');
        window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2200);
      } catch {
        pushToast('无法访问剪贴板，请手动选择并复制。', 'warn');
      }
    },
    [pushToast]
  );

  return (
    <SceneLayout route={route} bodyClassName="contact">
      {/* ----------------------------------------------------------- hero -- */}
      <section className="contact__hero" aria-labelledby="contact-hero">
        <div className="contact__hero-mark" aria-hidden="true">
          <Logo height={52} />
        </div>

        <h2 id="contact-hero" className="contact__hero-title">
          如果你想聊摄影、机械或者技术，可以从这里开始。
        </h2>

        <p className="contact__hero-body">
          我通常更愿意收到具体的消息：一张你拍的片子、一段路线、一个没想清楚的技术问题。
          泛泛的打招呼当然也可以，只是回复可能会慢一些。
        </p>
      </section>

      {/* -------------------------------------------------------- channels -- */}
      <section className="section" aria-labelledby="contact-channels">
        <div className="section__head">
          <h2 id="contact-channels" className="section__title">
            联系方式
          </h2>
          <p className="u-label">
            已确认 {confirmed.length} / {CONTACT_CHANNELS.length}
          </p>
        </div>

        {confirmed.length > 0 ? (
          <ul className="contact__channels">
            {confirmed.map((channel) => (
              <li key={channel.id}>
                <GlassSurface tier="depth" className="contact__channel" radius="var(--r-lg)">
                  <span className="contact__channel-icon" aria-hidden="true">
                    <Icon name={CHANNEL_ICON[channel.id] ?? 'signal'} size={18} />
                  </span>

                  <div className="contact__channel-body">
                    <span className="contact__channel-label">{channel.label}</span>
                    <span className="contact__channel-handle u-mono">{channel.handle}</span>
                  </div>

                  <div className="contact__channel-actions">
                    {channel.url ? (
                      <a
                        className="btn btn--line btn--sm"
                        href={channel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="arrow-out" size={14} />
                        <span>打开</span>
                      </a>
                    ) : null}

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void copy(channel.handle ?? '', channel.id)}
                    >
                      <Icon name={copied === channel.id ? 'check' : 'journal'} size={14} />
                      <span>{copied === channel.id ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </GlassSurface>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Every unconfirmed channel is listed with the reason it is empty. This
            is the honest counterpart to a page full of social icons. */}
        {pending.length > 0 ? (
          <GlassSurface tier="standard" className="contact__pending" radius="var(--r-lg)">
            <h3 className="contact__pending-title">
              <Icon name="alert" size={15} />
              尚未提供
            </h3>
            <p className="contact__pending-note">
              下面这些渠道我还没有拿到真实账号，所以不会显示成可以点击的图标——
              一个点不开的社交图标比空白更没有意义。
            </p>
            <ul className="contact__pending-list">
              {pending.map((channel) => (
                <li key={channel.id}>
                  <span className="contact__pending-label">
                    {channel.label}
                    <span className="contact__pending-en u-label">{channel.labelEn}</span>
                  </span>
                  <PendingMarker label="待填写" />
                  {channel.note ? <span className="contact__pending-why">{channel.note}</span> : null}
                </li>
              ))}
            </ul>
          </GlassSurface>
        ) : null}
      </section>

      {/* --------------------------------------------------------- mailto -- */}
      {email?.handle ? (
        <section className="section" aria-labelledby="contact-mail">
          <div className="section__head">
            <h2 id="contact-mail" className="section__title">
              写一封邮件
            </h2>
            <p className="u-label">DIRECT MAIL</p>
          </div>

          <GlassSurface tier="depth" className="contact__mail" radius="var(--r-xl)">
            <p className="contact__mail-body">
              这个链接会直接打开你的邮件客户端，并带上一个已经写好的主题——
              它不经过任何服务器，所以我不会知道你在什么时候点开了它。
            </p>

            <a
              className="btn btn--solid btn--lg"
              href={`mailto:${email.handle}?subject=${encodeURIComponent(`来自网站的问候 · ${BRAND.nickname}`)}`}
            >
              <Icon name="signal" size={18} />
              <span>撰写邮件</span>
            </a>

            <p className="contact__mail-addr u-mono">{email.handle}</p>
          </GlassSurface>
        </section>
      ) : null}

      {/* ------------------------------------------------- why no form -- */}
      <section className="section" aria-labelledby="contact-form-note">
        <div className="section__head">
          <h2 id="contact-form-note" className="section__title">
            为什么没有留言表单
          </h2>
          <p className="u-label">NO SERVER, NO FAKE FORM</p>
        </div>

        <GlassSurface tier="standard" className="contact__explain" radius="var(--r-lg)">
          <p>{CONTACT_FORM_NOTE}</p>
          <ul className="contact__explain-list">
            <li>
              <Icon name="check" size={14} />
              <span>
                <b>纯静态托管。</b>本站部署在 GitHub Pages 上，只有静态文件，
                没有任何接收表单的接口。
              </span>
            </li>
            <li>
              <Icon name="check" size={14} />
              <span>
                <b>不伪造成功提示。</b>没有后端却显示「已发送成功」是一个明确的谎言，
                所以这里干脆不提供表单。
              </span>
            </li>
            <li>
              <Icon name="check" size={14} />
              <span>
                <b>可以自己加。</b>如果你确实需要留言功能，接入一个免费的表单服务
                （如 Formspree、Getform）并在 <code>ContactPage.tsx</code> 中替换这一段即可。
              </span>
            </li>
          </ul>
        </GlassSurface>
      </section>

      {/* ---------------------------------------------------------- privacy -- */}
      <section className="section" aria-labelledby="contact-privacy">
        <div className="section__head">
          <h2 id="contact-privacy" className="section__title">
            隐私
          </h2>
          <p className="u-label">PRIVACY</p>
        </div>
        <p className="contact__privacy">{CONTACT_PRIVACY_NOTE}</p>
      </section>

      <div className="contact__back">
        <Link to="/" className="btn btn--line btn--md">
          <Icon name="arrow-left" size={16} />
          <span>返回主空间</span>
        </Link>
      </div>
    </SceneLayout>
  );
}
