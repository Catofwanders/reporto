import { useEffect, useState } from 'react';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import type { JiraReport, PrsReport, ProjectMap, StatsReport } from '../types';
import { fetchProjectMap } from '../projectMap';
import { InfraDiagram } from '../components/InfraDiagram';
import { ProjectGrid } from '../components/ProjectGrid';
import { WorkflowStrip } from '../components/WorkflowStrip';

interface ProjectsPageProps {
  jira: JiraReport | null;
  prs: PrsReport | null;
  stats: StatsReport | null;
}

/**
 * The map of the work: how a ticket travels, which repositories exist and what they are, and
 * what talks to what.
 *
 * Hand-written, because none of it can be derived — a repository does not say what it is for
 * and no API knows which service sits behind which gateway. It lives in gitignored config
 * for the same reason: it names an employer's systems and this remote is public.
 */
export const ProjectsPage = ({ jira, prs, stats }: ProjectsPageProps) => {
  const [map, setMap] = useState<ProjectMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProjectMap()
      .then((next) => {
        if (!cancelled) setMap(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="grid">
        <p className="status error">{error}</p>
      </main>
    );
  }

  if (!map) {
    return (
      <main className="grid">
        <p className="status">Reading the project map…</p>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-warn" aria-hidden="true">
              <RouteRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>How work travels</h2>
              <p className="panel-sub">Ticket route, with mine counted at each stop</p>
            </div>
          </div>
        </div>
        <WorkflowStrip map={map} jira={jira} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-open" aria-hidden="true">
              <AccountTreeRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>Projects</h2>
              <p className="panel-sub">
                {map.projects.length} repositories — what each is, and what of mine is in it
              </p>
            </div>
          </div>
        </div>
        <ProjectGrid map={map} prs={prs} stats={stats} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-qc" aria-hidden="true">
              <LayersRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>Backend, high level</h2>
              <p className="panel-sub">What talks to what — not how it is deployed</p>
            </div>
          </div>
        </div>
        <InfraDiagram map={map} />
      </section>
    </main>
  );
};
