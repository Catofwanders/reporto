import type { JiraReport, ProjectMap } from '../types';

interface WorkflowStripProps {
  map: ProjectMap;
  /** Counted live, so the strip says where the work actually sits today. */
  jira: JiraReport | null;
}

const countIn = (jira: JiraReport | null, statuses: string[] | undefined) => {
  if (!jira || !statuses?.length) return null;
  const wanted = statuses.map((status) => status.toLowerCase());
  return jira.groups
    .flatMap((group) => group.tickets)
    .filter((ticket) => wanted.includes(ticket.status.trim().toLowerCase())).length;
};

/**
 * The route a ticket takes, left to right, with how many of mine are sitting at each stop.
 *
 * The count is what makes it more than a picture: a stage holding nine tickets is where the
 * work is stuck, and that is invisible in a diagram of the process alone.
 */
export const WorkflowStrip = ({ map, jira }: WorkflowStripProps) => (
  <div className="flow-strip-wrap">
    <ol className="flow-strip">
      {map.workflow.stages.map((stage) => {
        const count = countIn(jira, stage.statuses);
        return (
          <li key={stage.id} className={count ? 'has-work' : ''}>
            <span className="flow-strip-head">
              <span className="flow-strip-label">{stage.label}</span>
              {count !== null && <span className="count">{count}</span>}
            </span>
            {stage.note && <span className="flow-strip-note">{stage.note}</span>}
          </li>
        );
      })}
    </ol>
    {map.workflow.note && <p className="panel-foot">{map.workflow.note}</p>}
  </div>
);
