/**
 * types.ts — the content model.
 *
 * Every field that the site renders comes from a type declared here, and every
 * collection declared here has a matching file in src/content/ and a matching
 * collection definition in public/admin/config.yml (the CMS). Keeping the three
 * in step is what makes the CMS a real content workflow rather than a mock-up.
 *
 * Honesty rules encoded in the model:
 *   • `sample` marks content that is NOT the author's real material. The UI
 *     renders a visible marker for it. Nothing sample may ever be presented as
 *     a real experience.
 *   • Optional fields are typed `?:` and are omitted rather than filled with
 *     invented values. The UI hides absent fields instead of printing empty
 *     labels.
 *   • External links are typed as `string | null` and null renders as a "待填写"
 *     marker. We never fabricate a URL.
 */

/** Marks provenance of a content record. */
export type Provenance =
  /** Placeholder material shipped with the project. Never claims to be real. */
  | 'sample'
  /** Supplied by the author. */
  | 'real';

/**
 * BrandIdentity — the naming system.
 *
 * V3 changes how the brand is written. It is 「汤圆Vision」 — a Chinese word
 * bound directly to an English word — and its Chinese gloss is 「汤圆视界」.
 * Three separate fields exist because the three parts are typeset differently
 * and must never be reassembled from one another:
 *
 *   brandFull   汤圆Vision    the lockup, used as the whole name
 *   nickname    汤圆          the Chinese half, used when only one weight is needed
 *   brandLatin  Vision        the Latin half, set in the display face
 *   brandGloss  汤圆视界      the Chinese gloss — required, not decorative
 *
 * The romanisation "TangyuanVision" is deliberately NOT a field. It must not
 * appear as the brand name anywhere in the interface.
 */
export interface BrandIdentity {
  /** The Chinese half, e.g. 汤圆. */
  nickname: string;
  /** The Latin half, e.g. Vision. */
  brandLatin: string;
  /** The full lockup, e.g. 汤圆Vision. */
  brandFull: string;
  /** The Chinese gloss, e.g. 汤圆视界. Required. */
  brandGloss: string;
  logoLine: string;
  tagline: string;
  taglineEn: string;
  statement: string;
  statementEn: string;
  location?: string;
  roles: string[];
}

export interface ProfileBlock {
  id: string;
  title: string;
  titleEn: string;
  body: string;
  /** Optional supporting line, e.g. what draws the author to the topic. */
  note?: string;
  provenance: Provenance;
}

/* ------------------------------------------------------------ photography */

export type PhotoCategory = 'landscape' | 'portrait' | 'other';

export interface Photo {
  id: string;
  title: string;
  category: PhotoCategory;
  /** Base path without the deploy base, e.g. /assets/photography/x.webp */
  src: string;
  /** Optional separate thumbnail; when absent the site derives one. */
  thumb?: string;
  width: number;
  height: number;
  description: string;
  /** Dominant colour, used to tint the surrounding space and to avoid a flash. */
  tone: string;
  /** All of the following are omitted when unknown — never invented. */
  takenAt?: string;
  location?: string;
  camera?: string;
  lens?: string;
  /**
   * Real capture coordinate, read from the file's own EXIF.
   *
   * Present only when the photograph carried a GPS fix. The globe uses it to
   * place the photo where it was actually taken; a photograph without one simply
   * has no marker, because a guessed coordinate on a travel map is a lie.
   */
  latitude?: number;
  longitude?: number;
  exif?: Record<string, string>;
  /**
   * 1-based grid span hints for the asymmetric editorial layout. Optional: the
   * layout falls back to a deterministic rhythm when absent.
   */
  feature?: boolean;
  order?: number;
  provenance: Provenance;
}

/* ----------------------------------------------------------------- riding */

export interface RouteStop {
  name: string;
  /** Coordinates are omitted unless genuinely known. */
  lat?: number;
  lng?: number;
  note?: string;
}

export interface RideRoute {
  id: string;
  name: string;
  nameEn: string;
  origin: string;
  destination: string;
  /** Total distance in kilometres. Omitted when not actually measured. */
  distanceKm?: number;
  /** ISO date the ride happened. Omitted for planned/unridden routes. */
  riddenAt?: string;
  /** 'ridden' = actually completed; 'planned' = intention only. */
  status: 'ridden' | 'planned';
  summary: string;
  stops: RouteStop[];
  /** Photo ids from the photography collection, when relevant. */
  photoIds?: string[];
  highlights?: string[];
  provenance: Provenance;
}

export interface MotorcycleSpec {
  label: string;
  value: string;
}

export interface Motorcycle {
  id: string;
  model: string;
  modelEn: string;
  /** Only the model already disclosed by the author is stated as fact. */
  confirmedDetails: MotorcycleSpec[];
  /** Everything else is explicitly a slot awaiting the author's input. */
  pendingDetails: string[];
  note?: string;
  image?: string;
  provenance: Provenance;
}

export interface ServiceRecord {
  id: string;
  date?: string;
  odometerKm?: number;
  items: string[];
  note?: string;
  provenance: Provenance;
}

/* -------------------------------------------------------------------- lab */

export interface LabNote {
  id: string;
  title: string;
  titleEn?: string;
  /** ISO date. */
  date?: string;
  /** What was being investigated. */
  question: string;
  /** What was actually done. */
  approach: string;
  /** What came out of it — including "inconclusive". */
  outcome: string;
  tools: string[];
  /** Short code excerpt, if the note genuinely had one. */
  snippet?: { language: string; code: string; caption?: string };
  /** Interactive demo id, resolved by the lab feature. */
  demo?: string;
  provenance: Provenance;
}

/* --------------------------------------------------------------- projects */

export interface Project {
  id: string;
  name: string;
  nameEn?: string;
  status: 'shipped' | 'building' | 'exploring' | 'paused';
  summary: string;
  detail: string;
  stack: string[];
  cover?: string;
  /** null means "not supplied" and renders as a 待填写 marker. */
  repoUrl: string | null;
  demoUrl: string | null;
  screenshots?: string[];
  highlights?: string[];
  order?: number;
  provenance: Provenance;
}

/* ---------------------------------------------------------------- journal */

export interface JournalEntry {
  id: string;
  title: string;
  titleEn?: string;
  date?: string;
  kind: 'essay' | 'note' | 'log';
  excerpt: string;
  /** Body paragraphs. Rendered in order. */
  body: string[];
  tags?: string[];
  provenance: Provenance;
}

/* ---------------------------------------------------------------- contact */

export interface ContactChannel {
  id: string;
  label: string;
  labelEn: string;
  /** null when the author has not supplied the account. */
  handle: string | null;
  /** Only real URLs. null renders as a 待填写 marker with no link. */
  url: string | null;
  /** Whether the platform is confirmed to exist for this author. */
  confirmed: boolean;
  note?: string;
}

/* --------------------------------------------------------------- settings */

export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  ogImage: string;
  themeColor: string;
  /** Scene shown at "/" — always the hub. */
  homeScene: string;
  /** Whether the hidden space exists as a route. */
  secretEnabled: boolean;
  /** Whether the boot sequence runs on a first visit. */
  bootEnabled: boolean;
  /**
   * The home stage backdrop photograph (CMS-managed via settings.json).
   * Absent or unresolvable means the drawn cinematic field carries the page.
   */
  homeBackground?: {
    src?: string;
    tone?: string;
    /** 0–1: how far the photograph is held back behind the wash. */
    overlay?: number;
    provenance?: 'sample' | 'real';
  };
}

/* ---------------------------------------------------------------- secret */

export interface SecretContent {
  title: string;
  titleEn: string;
  /** Entry phrase typed into the hidden console. */
  phrase: string;
  /** A short manifesto shown in the hidden space. */
  manifesto: string[];
  artifacts: Array<{
    id: string;
    label: string;
    body: string;
    /** 'unwritten' = an honest placeholder awaiting real content. */
    state: 'unwritten' | 'ready';
  }>;
}

/* ------------------------------------------------------------ collection */

export interface ContentBundle {
  brand: BrandIdentity;
  profile: ProfileBlock[];
  photos: Photo[];
  routes: RideRoute[];
  motorcycle: Motorcycle;
  serviceRecords: ServiceRecord[];
  labNotes: LabNote[];
  projects: Project[];
  journal: JournalEntry[];
  contact: ContactChannel[];
  settings: SiteSettings;
  secret: SecretContent;
}
