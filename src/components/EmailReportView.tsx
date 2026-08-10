import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import type { EmailItem, EmailReport } from '../types';
import type { Todo } from '../db';
import { emailRows } from '../emailRows';
import { Chip } from './Chip';
import { ReportAccordion } from './ReportAccordion';
import { RefreshButton } from './RefreshButton';

interface EmailReportViewProps {
  report: EmailReport;
  todos: Todo[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

interface RowProps {
  item: EmailItem;
  todo: Todo | undefined;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  id: string;
}

const Row = ({ item, todo, onToggle, onDelete, id }: RowProps) => (
  <article className={`item ${todo?.checked ? 'done' : ''}`}>
    <Checkbox
      checked={todo?.checked ?? false}
      onChange={(e) => onToggle(id, e.target.checked)}
      size="small"
      sx={{ padding: '.1rem', color: 'var(--ink-2)', '&.Mui-checked': { color: 'var(--ok-ink)' } }}
      slotProps={{ input: { 'aria-label': `done: ${item.subject}` } }}
    />
    <Chip tone={item.chip}>{item.chipLabel}</Chip>
    <div className="item-body">
      <div className="item-top">
        <span className="from">{item.from}</span>
        <span className="time">{item.time}</span>
        {item.refLabel && item.refUrl && (
          <a className="ref" href={item.refUrl} target="_blank" rel="noopener">
            {item.refLabel}
          </a>
        )}
      </div>
      <p className="subj">
        <a href={item.mailUrl} target="_blank" rel="noopener">
          {item.subject}
        </a>
      </p>
      {item.note && <p className="note">{item.note}</p>}
    </div>
    <div className={`action ${item.action ? 'need' : 'none'}`}>{item.action ?? '—'}</div>
    <IconButton
      aria-label={`delete: ${item.subject}`}
      size="small"
      onClick={() => onDelete(id)}
      sx={{ color: 'var(--ink-2)', '&:hover': { color: 'var(--bad-ink)' } }}
    >
      <DeleteOutlineIcon fontSize="small" />
    </IconButton>
  </article>
);

export const EmailReportView = ({ report, todos, onToggle, onDelete }: EmailReportViewProps) => {
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const rows = emailRows(report).map((row) => ({ ...row, todo: todoById.get(row.id) }));
  const actionCount = rows.filter(
    ({ item, todo }) => item.action && !todo?.checked && !todo?.deleted,
  ).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>📬 Mail</h2>
        <span className="panel-meta">
          <RefreshButton kind="email" />
          {report.date}
          {actionCount > 0 && <Chip tone="bad">{actionCount} need action</Chip>}
        </span>
      </div>

      {report.sections.map((section) => {
        const visible = rows.filter(
          (row) => row.sectionTitle === section.title && !row.todo?.deleted,
        );
        const ordered = [
          ...visible.filter((r) => !r.todo?.checked),
          ...visible.filter((r) => r.todo?.checked),
        ];

        return (
          <ReportAccordion
            key={section.title}
            title={section.title}
            count={ordered.length}
            meta={section.account}
          >
            <div className="list">
              {ordered.length === 0 && <div className="empty">Nothing actionable.</div>}
              {ordered.map((row) => (
                <Row
                  key={row.id}
                  id={row.id}
                  item={row.item}
                  todo={row.todo}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </ReportAccordion>
        );
      })}

      <p className="foot">Filtered out: {report.filteredOut}</p>
    </section>
  );
};
