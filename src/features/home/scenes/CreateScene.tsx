/**
 * CreateScene — scene 04, split: narrative left, evidence right.
 *
 * Density is budgeted for ONE viewport: two lab notes and two projects, each
 * clamped to two lines, plus the hardware bench as a single honest empty row.
 * Everything beyond that lives on /lab and /projects — the scene is a door,
 * not an archive. Statuses render exactly as the content declares them.
 */

import { NAVIGABLE_ROUTES } from '@/app/routes';
import { LAB_NOTES, PROJECTS } from '@/content';
import type { Project } from '@/content/types';
import { ProvenanceBadge, PendingMarker } from '@/components/ui/ProvenanceBadge';
import { Icon } from '@/components/ui/Icon';
import { SceneShell } from './SceneShell';

const STATUS_LABEL: Record<Project['status'], string> = {
  shipped: '已完成',
  building: '开发中',
  exploring: '构思中',
  paused: '已暂停',
};

export function CreateScene() {
  const route = NAVIGABLE_ROUTES.find((r) => r.id === 'lab')!;
  const lab = LAB_NOTES.slice(0, 2);
  const projects = PROJECTS.slice(0, 2);

  return (
    <SceneShell
      route={{ ...route, title: '创造与实验', labelEn: 'CREATE & EXPERIMENT' }}
      index="04"
      variant="split"
      lede="提出问题，做最小的验证；从想法到可以运行的东西。包含未跑通的结论。"
      headExtra={
        <p className="vscene__note cscene__bench">
          <PendingMarker label="硬件实验台 · ESP32 / STM32" />
          <span>尚无记录可展示——位置真实，内容不编造。</span>
        </p>
      }
      ctas={[
        { to: '/lab', label: '进入 AI 与编程', en: 'LAB', primary: true },
        { to: '/projects', label: '进入个人项目', en: 'PROJECTS' },
      ]}
      bodyClassName="vscene__body--cols"
    >
      <section className="cscene__col" aria-label="实验记录">
        <h3 className="cscene__col-title u-label">实验记录 / LAB NOTES</h3>
        <ul className="cscene__list">
          {lab.map((n) => (
            <li key={n.id} className="cscene__card">
              <span className="cscene__card-head">
                <span className="cscene__card-title">{n.title}</span>
                <ProvenanceBadge provenance={n.provenance} compact />
              </span>
              <span className="cscene__card-q">{n.question}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cscene__col" aria-label="个人项目">
        <h3 className="cscene__col-title u-label">个人项目 / PROJECTS</h3>
        <ul className="cscene__list">
          {projects.map((p) => (
            <li key={p.id} className="cscene__card">
              <span className="cscene__card-head">
                <span className="cscene__card-title">{p.name}</span>
                <span className={`cscene__status cscene__status--${p.status}`}>
                  {STATUS_LABEL[p.status]}
                </span>
                <ProvenanceBadge provenance={p.provenance} compact />
              </span>
              <span className="cscene__card-q">{p.summary}</span>
              <span className="cscene__card-o">
                {p.repoUrl ? (
                  <a className="cscene__repo" href={p.repoUrl} rel="noreferrer noopener" target="_blank">
                    <Icon name="arrow-right" size={13} /> 仓库链接
                  </a>
                ) : (
                  <span className="cscene__norepo">仓库链接尚未公开</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </SceneShell>
  );
}
