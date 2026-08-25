import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import type { JiraReport, PrsReport, ProjectMap } from '../types';
import { fetchProjectMap } from '../projectMap';
import { FlowDiagram } from '../components/FlowDiagram';

interface ProjectPageProps {
  jira: JiraReport | null;
  prs: PrsReport | null;
}

/**
 * One project in detail: what it is, the paths through it worth drawing, and what of mine is
 * currently in it.
 *
 * The flows are hand-written in `config/projects.json` — a repository does not describe its
 * own sign-in sequence — and each carries where it was read from, so a reader can check it
 * instead of trusting it. A flow nobody has confirmed against the running system says so.
 */
export const ProjectPage = ({ jira, prs }: ProjectPageProps) => {
  const { id } = useParams();
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

  if (error) return <main className="grid"><p className="status error">{error}</p></main>;
  if (!map) return <main className="grid"><p className="status">Reading the project map…</p></main>;

  const project = map.projects.find((entry) => entry.id === id);
  if (!project) {
    return (
      <main className="grid">
        <p className="status">
          No project called “{id}”. <Link to="/projects">Back to the map</Link>.
        </p>
      </main>
    );
  }

  const openPrs = prs?.repos.find((group) => group.repo === project.name)?.prs ?? [];
  // Tickets whose PRs live in this repo: the board does not group by repository, so this is
  // the only place that answers "what am I doing in here".
  const tickets = (jira?.groups ?? [])
    .flatMap((group) => group.tickets)
    .filter((ticket) => ticket.prs.some((pr) => pr.repo.split('/').pop() === project.name));
  const consumes = (project.consumes ?? [])
    .map((ref) => map.projects.find((entry) => entry.id === ref))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const consumedBy = map.projects.filter((entry) => entry.consumes?.includes(project.id));

  return (
    <main className="grid">
      <Link to="/projects" className="back-link">
        <ArrowBackRoundedIcon fontSize="inherit" /> All projects
      </Link>

      <section className={`panel project-hero role-${project.role}`}>
        <div className="panel-head">
          <div>
            <h2>{project.title}</h2>
            <p className="panel-sub">{project.what}</p>
          </div>
          <span className="panel-meta">
            {project.url && (
              <a href={project.url} target="_blank" rel="noopener noreferrer">
                {project.name} ↗
              </a>
            )}
          </span>
        </div>

        <ul className="project-stack">
          {project.stack.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
          {project.base && <li>base {project.base}</li>}
        </ul>

        <div className="project-hero-grid">
          <div>
            <h3>Depends on</h3>
            {consumes.length === 0 ? (
              <p className="status">nothing else on the map</p>
            ) : (
              <ul className="project-links">
                {consumes.map((entry) => (
                  <li key={entry.id}>
                    <Link to={`/projects/${entry.id}`}>{entry.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3>Used by</h3>
            {consumedBy.length === 0 ? (
              <p className="status">nothing else on the map</p>
            ) : (
              <ul className="project-links">
                {consumedBy.map((entry) => (
                  <li key={entry.id}>
                    <Link to={`/projects/${entry.id}`}>{entry.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3>Mine in here now</h3>
            {openPrs.length === 0 && tickets.length === 0 ? (
              <p className="status">nothing open</p>
            ) : (
              <ul className="project-links">
                {openPrs.map((pr) => (
                  <li key={pr.url}>
                    <Link to={`/prs#${project.name}-${pr.num}`}>#{pr.num}</Link> {pr.title}
                  </li>
                ))}
                {tickets.map((ticket) => (
                  <li key={ticket.key}>
                    <Link to={`/jira#${ticket.key}`}>{ticket.key}</Link> {ticket.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {(project.flows ?? []).map((flow) => (
        <section key={flow.id} className="panel">
          <div className="panel-head">
            <div>
              <h2>{flow.title}</h2>
              <p className="panel-sub">{flow.what}</p>
            </div>
            <span className="panel-meta">
              {flow.verified === false && (
                <span className="chip chip-warn" title="Not confirmed against the running system">
                  unverified
                </span>
              )}
              {flow.source && <code className="flow-source">{flow.source}</code>}
            </span>
          </div>
          <FlowDiagram flow={flow} />
        </section>
      ))}

      {(project.flows ?? []).length === 0 && (
        <section className="panel">
          <p className="status">
            No flows described for this project yet. Add them under its <code>flows</code> in{' '}
            <code>config/projects.json</code> — the shape is in{' '}
            <code>config.template/projects.json</code>.
          </p>
        </section>
      )}
    </main>
  );
};
