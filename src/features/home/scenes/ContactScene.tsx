/**
 * ContactScene — scene 05: contact as its own room, not a footer link.
 * Cards use the shared liquid-glass depth tier; only `confirmed` channels in
 * contact.json render as live links, the rest show the pending marker.
 */

import { NAVIGABLE_ROUTES } from '@/app/routes';
import { CONTACT_CHANNELS, CONTACT_PRIVACY_NOTE, CONTACT_FORM_NOTE } from '@/content';
import { PendingMarker } from '@/components/ui/ProvenanceBadge';
import { Icon } from '@/components/ui/Icon';
import { SceneShell } from './SceneShell';

export function ContactScene() {
  const route = NAVIGABLE_ROUTES.find((r) => r.id === 'contact')!;
  const confirmed = CONTACT_CHANNELS.filter((c) => c.confirmed && c.url);
  const pending = CONTACT_CHANNELS.filter((c) => !(c.confirmed && c.url));

  return (
    <SceneShell
      route={route}
      index="05"
      lede="可以在这里找到我。只列出真实存在且确认公开的渠道。"
      ctas={[{ to: '/contact', label: '进入联系方式', en: 'CONTACT', primary: true }]}
    >
      <ul className="kscene__grid">
        {confirmed.map((c) => (
          <li key={c.id}>
            <a
              className="kscene__card glass glass--depth"
              data-interactive="true"
              href={c.url!}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="kscene__card-label">{c.label}</span>
              <span className="kscene__card-handle u-mono">{c.handle || c.url}</span>
              <span className="kscene__card-en u-label">{c.labelEn}</span>
            </a>
          </li>
        ))}
        {pending.map((c) => (
          <li key={c.id}>
            <div className="kscene__card glass glass--depth kscene__card--pending" aria-disabled="true">
              <span className="kscene__card-label">{c.label}</span>
              <PendingMarker />
              <span className="kscene__card-en u-label">{c.labelEn}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="kscene__notes">
        {CONTACT_PRIVACY_NOTE ? (
          <p className="vscene__note">
            <Icon name="sparkle" size={13} /> {CONTACT_PRIVACY_NOTE}
          </p>
        ) : null}
        {CONTACT_FORM_NOTE ? <p className="vscene__note">{CONTACT_FORM_NOTE}</p> : null}
      </div>
    </SceneShell>
  );
}
