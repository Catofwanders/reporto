import type { ProjectMap, PrsReport, StatsReport } from '../types';

interface ProjectGridProps {
  map: ProjectMap;
  /** Open PRs per repo, so a card says whether anything of mine is in flight there. */
  prs: PrsReport | null;
  /** This month's merges per repo. */
  stats: StatsReport | null;
}

const openIn = (prs: PrsReport | null, repo: string) =>
  prs?.repos.find((group) => group.repo === repo)?.prs.length ?? 0;

const mergedIn = (stats: StatsReport | null, repo: string) =>
  stats?.months[0]?.prs?.byRepo.find((entry) => entry.repo === repo)?.merged ?? 0;

/**
 * One card per repository: what it is, what it is built from, and what of mine is in it
 * right now. The last part is the reason this is not a README — the same page answers "what
 * is this repo" and "am I in the middle of something there".
 */
export const ProjectGrid = ({ map, prs, stats }: ProjectGridProps) => (
  <div className="project-grid">
    {map.projects.map((project) => {
      const open = openIn(prs, project.name);
      const merged = mergedIn(stats, project.name);
      return (
        <article key={project.id} className={`project-card role-${project.role}`}>
          <div className="project-card-head">
            <h3>{project.title}</h3>
            <span className={`chip chip-${project.role === 'client' ? 'open' : 'qc'}`}>
              {project.role}
            </span>
          </div>

          {project.url ? (
            <a className="project-repo" href={project.url} target="_blank" rel="noopener noreferrer">
              {project.name}
            </a>
          ) : (
            <span className="project-repo">{project.name}</span>
          )}

          <p className="project-what">{project.what}</p>

          <ul className="project-stack">
            {project.stack.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>

          <div className="project-card-foot">
            {project.base && <span title="PRs open against this branch">base {project.base}</span>}
            {open > 0 && <span className="project-live">{open} open PR{open === 1 ? '' : 's'}</span>}
            {merged > 0 && <span>{merged} merged this month</span>}
          </div>
        </article>
      );
    })}
  </div>
);
