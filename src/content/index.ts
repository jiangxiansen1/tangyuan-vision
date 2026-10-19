/**
 * index.ts — the content registry.
 *
 * The site reads ALL content from src/content/data/*.json. Those same files are
 * what the CMS writes (see public/admin/config.yml), so there is exactly one
 * source of truth and no synchronisation step to get wrong.
 *
 * JSON imports are untyped at runtime: a hand-edited file can be missing a
 * required field without the compiler noticing. `validate()` below therefore
 * checks the shape once at module load and reports problems to the console, and
 * every accessor applies a defensive default. A broken content file degrades a
 * section; it never blanks the site.
 */

import type {
  BrandIdentity,
  ContactChannel,
  JournalEntry,
  LabNote,
  Motorcycle,
  Photo,
  Project,
  RideRoute,
  SecretContent,
  ServiceRecord,
  SiteSettings,
} from './types';

import brandJson from './data/brand.json';
import profileJson from './data/profile.json';
import photographyJson from './data/photography.json';
import travelPhotosJson from './data/travel-photos.json';
import ridingJson from './data/riding.json';
import labJson from './data/lab.json';
import projectsJson from './data/projects.json';
import journalJson from './data/journal.json';
import contactJson from './data/contact.json';
import settingsJson from './data/settings.json';
import secretJson from './data/secret.json';

/* ------------------------------------------------------------------ guards */

interface Issue {
  file: string;
  path: string;
  message: string;
}

const issues: Issue[] = [];

function requireString(file: string, obj: unknown, key: string, path = key): string {
  const rec = obj as Record<string, unknown> | null;
  const v = rec?.[key];
  if (typeof v !== 'string' || v.trim() === '') {
    issues.push({ file, path, message: `missing or empty string` });
    return '';
  }
  return v;
}

function optionalString(obj: unknown, key: string): string | undefined {
  const rec = obj as Record<string, unknown> | null;
  const v = rec?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function optionalNumber(obj: unknown, key: string): number | undefined {
  const rec = obj as Record<string, unknown> | null;
  const v = rec?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Unwrap a `{ items: [...] }` document.
 *
 * The CMS edits these files through a root-level list widget, which Decap writes
 * as an object with a single `items` key. Reading through this helper means the
 * site accepts BOTH shapes: the wrapped form the CMS produces, and a bare array
 * that a person might hand-write. Accepting both is what keeps a hand-edit from
 * silently emptying a page.
 */
function itemsOf(value: unknown, file: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  const wrapped = (value as { items?: unknown } | null)?.items;
  if (Array.isArray(wrapped)) {
    if (value !== null && typeof value === 'object' && !('items' in (value as object))) {
      issues.push({ file, path: 'items', message: 'document has no "items" array' });
    }
    return wrapped as Array<Record<string, unknown>>;
  }
  issues.push({ file, path: 'items', message: 'expected an array or an { items: [] } document' });
  return [];
}

/* ------------------------------------------------------------- collections */

export const BRAND: BrandIdentity = (() => {
  const b = brandJson as unknown as Partial<BrandIdentity> & { latin?: string };
  const nickname = requireString('brand.json', b, 'nickname');

  // `latin` was V2's field and held the romanisation "TangyuanVision". If an
  // older content file is still in place, it is migrated here rather than being
  // rendered as the brand name — V3 explicitly forbids the romanisation.
  const brandLatin = b.brandLatin ?? b.latin ?? 'Vision';
  const brandFull = b.brandFull ?? `${nickname || '汤圆'}${brandLatin}`;

  return {
    nickname: nickname || '汤圆',
    brandLatin,
    brandFull,
    brandGloss: b.brandGloss ?? '汤圆视界',
    logoLine: b.logoLine ?? 'CAPTURE MOMENTS',
    tagline: b.tagline ?? '',
    taglineEn: b.taglineEn ?? '',
    statement: b.statement ?? '',
    statementEn: b.statementEn ?? '',
    location: b.location,
    roles: asArray<string>(b.roles),
  };
})();

export const PROFILE = itemsOf(profileJson, 'profile.json').map((raw, i) => ({
  id: requireString('profile.json', raw, 'id', `[${i}].id`) || `profile-${i}`,
  title: requireString('profile.json', raw, 'title', `[${i}].title`),
  titleEn: optionalString(raw, 'titleEn') ?? '',
  body: optionalString(raw, 'body') ?? '',
  note: optionalString(raw, 'note'),
  provenance: (optionalString(raw, 'provenance') === 'real' ? 'real' : 'sample') as 'real' | 'sample',
}));

/* The two real categories, plus an honest bucket for legacy/unfiled records so
   nothing is silently dropped (see toPhoto). */
const PHOTO_CATEGORIES = ['landscape', 'portrait'] as const;

/** A photo record that failed validation is dropped rather than rendered broken. */
function toPhoto(raw: Record<string, unknown>, i: number): Photo | null {
  const id = optionalString(raw, 'id');
  const src = optionalString(raw, 'src');
  // Without an id or a source there is nothing renderable, so the record is
  // skipped and reported instead of producing an empty tile.
  if (!id || !src) {
    issues.push({
      file: 'photography.json',
      path: `[${i}]`,
      message: !id ? 'missing "id"' : 'missing "src"',
    });
    return null;
  }

  const cat = optionalString(raw, 'category');
  // landscape / portrait are the two categories; anything else (including the
  // legacy street/machine/sky/abstract values) is kept as 'other' rather than
  // discarded, so no record ever disappears from the portfolio.
  const category: Photo['category'] = (PHOTO_CATEGORIES as readonly string[]).includes(cat ?? '')
    ? (cat as Photo['category'])
    : 'other';

  return {
    id,
    title: optionalString(raw, 'title') ?? id,
    category,
    src,
    thumb: optionalString(raw, 'thumb'),
    width: optionalNumber(raw, 'width') ?? 1600,
    height: optionalNumber(raw, 'height') ?? 1067,
    description: optionalString(raw, 'description') ?? '',
    tone: optionalString(raw, 'tone') ?? '#101820',
    takenAt: optionalString(raw, 'takenAt'),
    location: optionalString(raw, 'location'),
    /*
     * The capture coordinate. It MUST be carried through here: the globe places
     * photo thumbnails from these two numbers, and the parser is a whitelist, so
     * a field it forgets silently vanishes from the whole site with no error.
     */
    latitude: optionalNumber(raw, 'latitude'),
    longitude: optionalNumber(raw, 'longitude'),
    camera: optionalString(raw, 'camera'),
    lens: optionalString(raw, 'lens'),
    exif: undefined,
    feature: raw.feature === true,
    order: optionalNumber(raw, 'order') ?? i,
    provenance: optionalString(raw, 'provenance') === 'real' ? 'real' : 'sample',
  };
}

export const PHOTOS: Photo[] = itemsOf(photographyJson, 'photography.json')
  .map(toPhoto)
  .filter((p): p is Photo => p !== null)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Travel photographs — a SEPARATE collection from the gallery.
 *
 * They were one list once, which meant every travel snapshot also appeared in the
 * portfolio and every portfolio piece had to be filtered out of the globe. They
 * answer different questions: one is "where have I been", the other is "what have I
 * made". Splitting the data is what keeps the two pages from leaking into each
 * other — no filtering, no hidden flags.
 *
 * Only photographs with real coordinates live here; a travel photo without a
 * position could not be placed on the globe anyway.
 */
export const TRAVEL_PHOTOS: Photo[] = itemsOf(travelPhotosJson, 'travel-photos.json')
  .map(toPhoto)
  .filter((p): p is Photo => p !== null)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Cover photographs, as a code-level fallback.
 *
 * `feature` is the field the CMS exposes for this, and it is honoured first. The
 * fallback exists because a CMS save re-serialises the whole collection and has
 * already reset the flag to false once — twice, in fact — silently turning the cover
 * row back into a run of portraits. These ids keep the covers stable even after that.
 *
 * Both halves cooperate: if any record carries feature: true, those are used and this
 * list is ignored. Only when nothing is marked does the fallback take over.
 */
export const COVER_PHOTO_IDS: readonly string[] = [
  '2025-11-15-1780572136130', // golden monastery in backlight
  '2025-11-15-1780572136145', // snow mountain and its reflection
  '2024-09-15-1780572313866', // ring bridge, long exposure at night
];

/** True when the record should lead a list: flagged in the CMS, or one of the defaults. */
export function isCoverPhoto(photo: Photo, anyFlagged: boolean): boolean {
  if (anyFlagged) return photo.feature === true;
  return COVER_PHOTO_IDS.includes(photo.id);
}

export const PHOTO_CATEGORY_LABELS: Record<Photo['category'], string> = {
  landscape: '风光 / Landscape',
  portrait: '人像 / Portrait',
  other: '未分类 / Unfiled',
};

const riding = ridingJson as unknown as {
  motorcycle?: Partial<Motorcycle>;
  routes?: RideRoute[];
  serviceRecords?: ServiceRecord[];
  serviceRecordNote?: string;
};

export const MOTORCYCLE: Motorcycle = (() => {
  const m = riding.motorcycle ?? {};
  return {
    id: m.id ?? 'motorcycle',
    model: m.model ?? '待填写',
    modelEn: m.modelEn ?? '',
    confirmedDetails: asArray(m.confirmedDetails),
    pendingDetails: asArray<string>(m.pendingDetails),
    note: m.note,
    image: m.image,
    provenance: (m.provenance === 'real' ? 'real' : 'sample') as 'real' | 'sample',
  };
})();

export const ROUTES: RideRoute[] = asArray<RideRoute>(riding.routes).map((r, i) => ({
  ...r,
  id: r.id || `route-${i}`,
  stops: asArray(r.stops),
  status: r.status === 'ridden' ? 'ridden' : 'planned',
  provenance: r.provenance === 'real' ? 'real' : 'sample',
}));

export const SERVICE_RECORDS: ServiceRecord[] = asArray<ServiceRecord>(riding.serviceRecords);

export const SERVICE_RECORD_NOTE: string = riding.serviceRecordNote ?? '';

export const LAB_NOTES: LabNote[] = itemsOf(labJson, 'lab.json')
  .map((raw, i) => ({
    id: optionalString(raw, 'id') ?? `lab-${i}`,
    title: optionalString(raw, 'title') ?? '(未命名)',
    titleEn: optionalString(raw, 'titleEn'),
    date: optionalString(raw, 'date'),
    question: optionalString(raw, 'question') ?? '',
    approach: optionalString(raw, 'approach') ?? '',
    outcome: optionalString(raw, 'outcome') ?? '',
    tools: asArray<string>(raw.tools),
    snippet: undefined,
    demo: optionalString(raw, 'demo'),
    provenance: (optionalString(raw, 'provenance') === 'real' ? 'real' : 'sample') as 'real' | 'sample',
  }))
  .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

export const PROJECTS: Project[] = itemsOf(projectsJson, 'projects.json')
  .map((raw, i) => {
    const status = optionalString(raw, 'status');
    const allowed = ['shipped', 'building', 'exploring', 'paused'];
    return {
      id: optionalString(raw, 'id') ?? `project-${i}`,
      name: optionalString(raw, 'name') ?? '(未命名项目)',
      nameEn: optionalString(raw, 'nameEn'),
      status: (allowed.includes(status ?? '') ? status : 'exploring') as Project['status'],
      summary: optionalString(raw, 'summary') ?? '',
      detail: optionalString(raw, 'detail') ?? '',
      stack: asArray<string>(raw.stack),
      cover: optionalString(raw, 'cover'),
      repoUrl: optionalString(raw, 'repoUrl') ?? null,
      demoUrl: optionalString(raw, 'demoUrl') ?? null,
      highlights: asArray<string>(raw.highlights),
      order: optionalNumber(raw, 'order') ?? i,
      provenance: (optionalString(raw, 'provenance') === 'real' ? 'real' : 'sample') as 'real' | 'sample',
    } satisfies Project;
  })
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const JOURNAL: JournalEntry[] = itemsOf(journalJson, 'journal.json').map((raw, i) => ({
  id: optionalString(raw, 'id') ?? `journal-${i}`,
  title: optionalString(raw, 'title') ?? '(未命名)',
  titleEn: optionalString(raw, 'titleEn'),
  date: optionalString(raw, 'date'),
  kind: (['essay', 'note', 'log'].includes(optionalString(raw, 'kind') ?? '')
    ? optionalString(raw, 'kind')
    : 'note') as JournalEntry['kind'],
  excerpt: optionalString(raw, 'excerpt') ?? '',
  body: asArray<string>(raw.body),
  tags: asArray<string>(raw.tags),
  provenance: (optionalString(raw, 'provenance') === 'real' ? 'real' : 'sample') as 'real' | 'sample',
}));

const contact = contactJson as unknown as {
  channels?: ContactChannel[];
  privacyNote?: string;
  formNote?: string;
};

export const CONTACT_CHANNELS: ContactChannel[] = asArray<ContactChannel>(contact.channels);
export const CONTACT_PRIVACY_NOTE: string = contact.privacyNote ?? '';
export const CONTACT_FORM_NOTE: string = contact.formNote ?? '';

export const SETTINGS: SiteSettings = (() => {
  const s = settingsJson as unknown as Partial<SiteSettings> & {
    siteTitleSuffix?: string;
    locale?: string;
    keywords?: string[];
  };
  return {
    siteTitle: s.siteTitle ?? BRAND.nickname,
    siteDescription: s.siteDescription ?? '',
    ogImage: s.ogImage ?? '/assets/brand/logo-light.png',
    themeColor: s.themeColor ?? '#05070A',
    homeScene: s.homeScene ?? 'home',
    secretEnabled: s.secretEnabled !== false,
    bootEnabled: s.bootEnabled !== false,
    homeBackground: readHomeBackground(settingsJson),
  };
})();

export const SITE_TITLE_SUFFIX: string =
  (settingsJson as unknown as { siteTitleSuffix?: string }).siteTitleSuffix ?? BRAND.nickname;

export const SITE_LOCALE: string =
  (settingsJson as unknown as { locale?: string }).locale ?? 'zh-CN';

export const SITE_KEYWORDS: string[] = asArray<string>(
  (settingsJson as unknown as { keywords?: unknown }).keywords
);

export const SECRET: SecretContent = (() => {
  const s = secretJson as unknown as Partial<SecretContent>;
  return {
    title: s.title ?? '静默空间',
    titleEn: s.titleEn ?? 'THE QUIET SPACE',
    phrase: s.phrase ?? 'explore beyond',
    manifesto: asArray<string>(s.manifesto),
    artifacts: asArray(s.artifacts),
  };
})();

/**
 * settings.json → homeBackground, validated.
 *
 * P2 found the real defect this guards: VisionBackdrop has always read
 * `SETTINGS.homeBackground`, but the content layer never exported it, so the
 * configured photograph could never appear. A missing/empty src returns
 * undefined and the backdrop falls back to its drawn field — a finished
 * design, never a broken image.
 */
function readHomeBackground(json: unknown): SiteSettings['homeBackground'] {
  const hb = (json as { homeBackground?: Record<string, unknown> } | null)?.homeBackground;
  if (!hb || typeof hb !== 'object') return undefined;
  const src = optionalString(hb, 'src');
  if (!src) return undefined;
  return {
    src,
    tone: optionalString(hb, 'tone'),
    overlay: optionalNumber(hb, 'overlay'),
    provenance: optionalString(hb, 'provenance') === 'real' ? 'real' : 'sample',
  };
}

/* -------------------------------------------------------------- reporting */

/** Content problems found at load. Surfaced in the console, never thrown. */
export const contentIssues: readonly Issue[] = issues;

if (issues.length > 0 && import.meta.env.DEV) {
  console.warn(
    `[content] ${issues.length} content problem(s) detected. The site still renders; ` +
      `fix these in src/content/data/ or via the CMS:\n` +
      issues.map((i) => `  • ${i.file} → ${i.path}: ${i.message}`).join('\n')
  );
}

/** Counts used by the hub and by the delivery documentation. */
export const CONTENT_COUNTS = {
  photos: PHOTOS.length,
  routes: ROUTES.length,
  labNotes: LAB_NOTES.length,
  projects: PROJECTS.length,
  journal: JOURNAL.length,
  contactChannels: CONTACT_CHANNELS.filter((c) => c.confirmed).length,
} as const;
