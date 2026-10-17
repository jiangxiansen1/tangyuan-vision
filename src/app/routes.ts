/**
 * routes.ts — the single route and scene registry.
 *
 * Everything spatial derives from this list: the hub's windows, the breadcrumb,
 * the keyboard access map, the sitemap-ish footer links, and the CMS preview
 * paths. Adding a scene means adding one entry here plus its page component —
 * there is no second place to remember.
 */

import type { ComponentType } from 'react';
import { lazy } from 'react';

export type SceneId =
  | 'home'
  | 'about'
  | 'photography'
  | 'earth'
  | 'riding'
  | 'lab'
  | 'projects'
  | 'journal'
  | 'contact'
  | 'secret';

export interface SceneRoute {
  id: SceneId;
  /** URL path, relative, without the deploy base. */
  path: string;
  /** Chinese label — the primary label throughout the UI. */
  label: string;
  /** Latin label, used as the visual secondary line. */
  labelEn: string;
  /** One-line description used on the hub window and in the command switcher. */
  blurb: string;
  /** Shown in the browser tab and in breadcrumbs. */
  title: string;
  description: string;
  /** Window accent, drawn from the scene theme. */
  accent: string;
  /** Lazy page component. The hub itself is eager; everything else is split. */
  Component: ComponentType;
  /** Hidden scenes are reachable but never listed in navigation. */
  hidden?: boolean;
  /** Keyboard shortcut that opens the scene from anywhere (a single letter). */
  key?: string;
  /** Grouping used by the hub layout so windows cluster meaningfully. */
  cluster: 'self' | 'craft' | 'machine' | 'system';
  /**
   * Which visual ground the scene runs on. Omitted means the default light
   * ground; 'dark' is for the two scenes that genuinely need darkness — the
   * Earth space and the photographic lightbox.
   */
  ground?: 'light' | 'dark';
}

/* The hub is the entry point and is loaded eagerly — delaying it would delay
   first paint for every visitor. */
import HomePage from '@/features/home/HomePage';

const AboutPage = lazy(() => import('@/features/about/AboutPage'));
const PhotographyPage = lazy(() => import('@/features/photography/PhotographyPage'));
const EarthPage = lazy(() => import('@/features/earth/EarthPage'));
const RidingPage = lazy(() => import('@/features/riding/RidingPage'));
const LabPage = lazy(() => import('@/features/lab/LabPage'));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'));
const JournalPage = lazy(() => import('@/features/journal/JournalPage'));
const ContactPage = lazy(() => import('@/features/contact/ContactPage'));
const SecretPage = lazy(() => import('@/features/secret/SecretPage'));

export const HOME_ROUTE: SceneRoute = {
  id: 'home',
  path: '/',
  label: '主空间',
  labelEn: 'HOME',
  blurb: '返回所有窗口的起点。',
  title: '主空间',
  description: '汤圆Vision 的数字空间入口。',
  accent: '#8fe3ff',
  Component: HomePage,
  cluster: 'self',
};

export const SCENE_ROUTES: SceneRoute[] = [
  {
    id: 'about',
    path: '/about',
    label: '关于我',
    labelEn: 'ABOUT',
    blurb: '我是谁，我在意什么',
    title: '关于我',
    description: '汤圆Vision 的个人介绍：摄影、机械与骑行、AI 与编程、独立创作。',
    accent: '#8fe3ff',
    Component: AboutPage,
    key: 'a',
    cluster: 'self',
  },
  {
    id: 'photography',
    path: '/photography',
    label: '摄影',
    labelEn: 'PHOTOGRAPHY',
    blurb: '光落在具体事物上的那一刻',
    title: '摄影',
    description: '摄影作品集：分类浏览、不对称构图与沉浸式灯箱查看。',
    accent: '#e8c287',
    Component: PhotographyPage,
    key: 'p',
    cluster: 'craft',
  },
  {
    id: 'earth',
    path: '/earth',
    label: '地球 Online 进度',
    labelEn: 'EARTH ONLINE',
    blurb: '我还没走完的那张地图',
    title: '地球 Online 进度',
    description:
      '可旋转、可缩放的真实三维地球：本地根据真实太阳位置计算昼夜分界，射线拾取国家与地区，' +
      '查看真实旅行记录与摄影关联。',
    accent: '#5fb0e8',
    Component: EarthPage,
    key: 'e',
    cluster: 'craft',
    // Light ground. Only the globe WELL is dark — a lit sphere needs an unlit
    // field, but the page around it stays part of the light product.
    ground: 'light',
  },
  {
    id: 'riding',
    path: '/riding',
    label: '摩旅与骑行',
    labelEn: 'RIDING',
    blurb: '机械的诚实与道路的边界',
    title: '摩旅与骑行',
    description: '摩托车档案、摩旅路线与骑行记录。车型与路线以本人提供的资料为准。',
    accent: '#c2571f',
    Component: RidingPage,
    key: 'r',
    cluster: 'machine',
  },
  {
    id: 'lab',
    path: '/lab',
    label: 'AI 与编程',
    labelEn: 'LAB',
    blurb: '提出问题，做最小的验证',
    title: 'AI 与编程实验室',
    description: '技术实验记录、开发过程与工具使用笔记，包含未跑通的结论。',
    accent: '#8ff5db',
    Component: LabPage,
    key: 'l',
    cluster: 'system',
  },
  {
    id: 'projects',
    path: '/projects',
    label: '个人项目',
    labelEn: 'PROJECTS',
    blurb: '从想法到可以运行的东西',
    title: '个人项目',
    description: '个人项目作品集：项目状态、技术栈、详情与仓库链接。',
    accent: '#9fc4ea',
    Component: ProjectsPage,
    key: 'o',
    cluster: 'system',
  },
  {
    id: 'journal',
    path: '/journal',
    label: '随笔与思考',
    labelEn: 'JOURNAL',
    blurb: '记录经过的光，也记录尚未抵达的远方',
    title: '随笔与思考',
    description: '随笔、宣言与笔记：关于摄影、机械、技术探索与独立创作。',
    accent: '#bfc8d4',
    Component: JournalPage,
    key: 'j',
    cluster: 'craft',
  },
  {
    id: 'contact',
    path: '/contact',
    label: '联系方式',
    labelEn: 'CONTACT',
    blurb: '可以在这里找到我',
    title: '联系方式',
    description: '社交账号与联系方式入口。',
    accent: '#d9f2ff',
    Component: ContactPage,
    key: 'c',
    cluster: 'self',
  },
];

/** The hidden scene. Registered for routing, excluded from every navigation. */
export const SECRET_ROUTE: SceneRoute = {
  id: 'secret',
  path: '/the-quiet-space',
  label: '静默空间',
  labelEn: 'THE QUIET SPACE',
  blurb: '',
  title: '静默空间',
  description: '一处不会被导航标记的地方。',
  accent: '#c3b2ff',
  Component: SecretPage,
  hidden: true,
  cluster: 'system',
};

/** All routes including the hidden one, for the router. */
export const ALL_ROUTES: SceneRoute[] = [HOME_ROUTE, ...SCENE_ROUTES, SECRET_ROUTE];

/** Only the routes that appear in navigation. */
export const NAVIGABLE_ROUTES: SceneRoute[] = SCENE_ROUTES;

/** Hub windows, in layout order. */
export const HUB_WINDOWS: SceneRoute[] = SCENE_ROUTES;

export function routeById(id: SceneId): SceneRoute | undefined {
  return ALL_ROUTES.find((r) => r.id === id);
}

/** Map a single-letter key to a scene, for global keyboard shortcuts. */
export function routeByKey(key: string): SceneRoute | undefined {
  const k = key.toLowerCase();
  return SCENE_ROUTES.find((r) => r.key === k);
}
