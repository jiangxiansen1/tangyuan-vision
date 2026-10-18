/**
 * regions.ts — the region content model and registry.
 *
 * THE HONESTY PROBLEM THIS SOLVES
 * The globe can identify 177 countries, but the author has not supplied any real
 * travel records. So the registry below has to make a hard distinction that the
 * UI depends on:
 *
 *   • A region is a GEOGRAPHIC FACT. Its boundary, ISO code and position come
 *     from Natural Earth data and are true regardless of the author.
 *   • A VISIT is the author's PERSONAL RECORD. It is content, it lives in the
 *     CMS-managed JSON, and when it is absent the UI must say so.
 *
 * Those two live in different files on purpose. `REGION_LABELS` is presentation
 * (a Chinese name for a country) and `TRAVELS` is content (what the author
 * actually did). Mixing them is how a site ends up implying a trip that never
 * happened.
 *
 * The Chinese labels are supplied here rather than fetched because the Natural
 * Earth dataset carries English names only, and a Chinese-language site that
 * labels every country in English would be worse than one that labels the ones it
 * needs. Missing labels fall back to the English name — never to a guess.
 */

import travelData from '@/content/data/travels.json';

/* --------------------------------------------------------------- labels -- */

/**
 * Chinese names, keyed by ISO 3166-1 numeric (the dataset's `id`).
 *
 * This is deliberately a partial map: it covers the places a Chinese-language
 * visitor is most likely to look for, and countries outside it fall back to the
 * English name from Natural Earth. A partial map that is CORRECT beats a complete
 * map that is machine-translated and wrong.
 */
const REGION_LABELS: Record<string, string> = {
  '156': '中国',
  '496': '蒙古',
  '158': '台湾',
  '344': '香港',
  '446': '澳门',
  '392': '日本',
  '410': '韩国',
  '408': '朝鲜',
  '764': '泰国',
  '704': '越南',
  '116': '柬埔寨',
  '418': '老挝',
  '104': '缅甸',
  '458': '马来西亚',
  '702': '新加坡',
  '360': '印度尼西亚',
  '608': '菲律宾',
  '096': '文莱',
  '050': '孟加拉国',
  '356': '印度',
  '586': '巴基斯坦',
  '524': '尼泊尔',
  '064': '不丹',
  '144': '斯里兰卡',
  '004': '阿富汗',
  '364': '伊朗',
  '368': '伊拉克',
  '760': '叙利亚',
  '400': '约旦',
  '376': '以色列',
  '682': '沙特阿拉伯',
  '784': '阿拉伯联合酋长国',
  '634': '卡塔尔',
  '414': '科威特',
  '512': '阿曼',
  '887': '也门',
  '792': '土耳其',
  '268': '格鲁吉亚',
  '051': '亚美尼亚',
  '031': '阿塞拜疆',
  '398': '哈萨克斯坦',
  '860': '乌兹别克斯坦',
  '795': '土库曼斯坦',
  '417': '吉尔吉斯斯坦',
  '762': '塔吉克斯坦',
  '643': '俄罗斯',
  '804': '乌克兰',
  '112': '白俄罗斯',
  '616': '波兰',
  '203': '捷克',
  '703': '斯洛伐克',
  '348': '匈牙利',
  '040': '奥地利',
  '756': '瑞士',
  '276': '德国',
  '250': '法国',
  '056': '比利时',
  '528': '荷兰',
  '442': '卢森堡',
  '826': '英国',
  '372': '爱尔兰',
  '208': '丹麦',
  '752': '瑞典',
  '578': '挪威',
  '246': '芬兰',
  '352': '冰岛',
  '233': '爱沙尼亚',
  '428': '拉脱维亚',
  '440': '立陶宛',
  '643_': '俄罗斯',
  '124': '加拿大',
  '840': '美国',
  '484': '墨西哥',
  '320': '危地马拉',
  '340': '洪都拉斯',
  '222': '萨尔瓦多',
  '558': '尼加拉瓜',
  '188': '哥斯达黎加',
  '591': '巴拿马',
  '192': '古巴',
  '388': '牙买加',
  '332': '海地',
  '214': '多米尼加共和国',
  '076': '巴西',
  '032': '阿根廷',
  '152': '智利',
  '604': '秘鲁',
  '170': '哥伦比亚',
  '862': '委内瑞拉',
  '218': '厄瓜多尔',
  '068': '玻利维亚',
  '600': '巴拉圭',
  '858': '乌拉圭',
  '036': '澳大利亚',
  '554': '新西兰',
  '234': '法罗群岛',
  '732': '西撒哈拉',
  '504': '摩洛哥',
  '012': '阿尔及利亚',
  '788': '突尼斯',
  '434': '利比亚',
  '818': '埃及',
  '729': '苏丹',
  '231': '埃塞俄比亚',
  '404': '肯尼亚',
  '834': '坦桑尼亚',
  '800': '乌干达',
  '646': '卢旺达',
  '024': '安哥拉',
  '894': '赞比亚',
  '716': '津巴布韦',
  '508': '莫桑比克',
  '710': '南非',
  '516': '纳米比亚',
  '072': '博茨瓦纳',
  '566': '尼日利亚',
  '288': '加纳',
  '384': '科特迪瓦',
  '686': '塞内加尔',
  '466': '马里',
  '562': '尼日尔',
  '148': '乍得',
  '120': '喀麦隆',
  '180': '刚果民主共和国',
  '178': '刚果共和国',
  '266': '加蓬',
  '450': '马达加斯加',
  '480': '毛里求斯',
  '010': '南极洲',
  '304': '格陵兰',
};

/* ---------------------------------------------------------------- model -- */

export type VisitStatus = 'visited' | 'planned' | 'unrecorded';

/**
 * One visited city inside a country.
 *
 * Travel records are keyed by COUNTRY, so a single record per country cannot say
 * that the visitor covered thirty-five cities inside it. `places` carries them.
 *
 * `source` exists because a coordinate can come from two very different places:
 * a GPS fix recorded at capture time, or a value typed in by hand from a map. They
 * must never be presented as equivalent.
 */
export interface PlaceVisit {
  /** City / prefecture name as the visitor wrote it. */
  name: string;
  /** Province grouping, for display only. */
  province?: string;
  lat?: number;
  lon?: number;
  /** 'gps' | 'manual' | 'approx' — how the coordinate was obtained. */
  source?: string;
}

export interface RegionTravel {
  /** ISO 3166-1 numeric, matching the geometry dataset. */
  regionId: string;
  status: VisitStatus;
  /** Plain-language name override, for cases where the label map is not right. */
  label?: string;
  /** Free-text title for the entry, e.g. a trip name. */
  title?: string;
  /** Only ever written when the author supplied a real date. */
  visitedAt?: string;
  /** Story text. Absent means absent — never generated. */
  story?: string;
  /** Photo ids from the photography collection. */
  photoIds?: string[];
  /** Real coordinates, only when the author recorded a specific place. */
  latitude?: number;
  longitude?: number;
  /** City-level visits inside this country. */
  places?: PlaceVisit[];
  /** Whether the CMS entry should be publicly listed. */
  published: boolean;
}

interface TravelDocument {
  items: RegionTravel[];
  notes?: string;
}

/** Normalised lookup, keyed by region id. */
const travelDoc = travelData as unknown as TravelDocument;

export const TRAVELS: Map<string, RegionTravel> = new Map(
  (Array.isArray(travelDoc.items) ? travelDoc.items : [])
    .filter((t) => t && typeof t.regionId === 'string')
    .map((t) => [
      t.regionId,
      {
        ...t,
        status: (['visited', 'planned', 'unrecorded'] as const).includes(t.status)
          ? t.status
          : 'unrecorded',
        published: t.published !== false,
      },
    ])
);

/**
 * The Chinese label for a region, or the English name when none is supplied.
 *
 * Returns the English name rather than transliterating: a wrong Chinese name is
 * worse than a correct English one.
 */
export function regionLabel(regionId: string, fallbackNameEn: string): string {
  const travel = TRAVELS.get(regionId);
  return travel?.label ?? REGION_LABELS[regionId] ?? fallbackNameEn;
}

/** Whether a Chinese label exists for this region. */
export function hasChineseLabel(regionId: string): boolean {
  return Boolean(TRAVELS.get(regionId)?.label ?? REGION_LABELS[regionId]);
}

/**
 * The travel record for a region, or a synthesised "unrecorded" one.
 *
 * The synthesised record is the important part: it lets the UI render a real,
 * complete panel for a country the author has never been to, and that panel says
 * "尚未记录" rather than inventing anything.
 */
export function travelFor(regionId: string): RegionTravel {
  const existing = TRAVELS.get(regionId);
  if (existing) return existing;
  return {
    regionId,
    status: 'unrecorded',
    published: true,
  };
}

export interface RegionStats {
  visited: number;
  planned: number;
  total: number;
  /** Share of the world's countries the author has actually recorded a visit to. */
  visitedPercent: number;
}

/** Counts for the Earth header. Derived from content, never hard-coded. */
export function regionStats(totalRegions: number): RegionStats {
  let visited = 0;
  let planned = 0;
  for (const travel of TRAVELS.values()) {
    if (!travel.published) continue;
    if (travel.status === 'visited') visited++;
    else if (travel.status === 'planned') planned++;
  }
  return {
    visited,
    planned,
    total: totalRegions,
    // Guarded: a zero total would otherwise produce NaN in the UI.
    visitedPercent: totalRegions > 0 ? (visited / totalRegions) * 100 : 0,
  };
}
