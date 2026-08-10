import type { EmailReport, JiraReport } from './types';
import type { Todo } from './db';
import { todoId } from './db';

export interface EmailSummary {
  needAction: number;
  done: number;
  items: number;
  perSection: { title: string; count: number }[];
}

export function summarizeEmail(report: EmailReport, todos: Todo[] = []): EmailSummary {
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const rows = report.sections.flatMap((s) =>
    s.items.map((i) => ({ section: s.title, item: i, todo: todoById.get(todoId(s.title, i.subject)) })),
  );
  const visible = rows.filter((r) => !r.todo?.deleted);
  return {
    needAction: visible.filter((r) => r.item.action && !r.todo?.checked).length,
    done: visible.filter((r) => r.todo?.checked).length,
    items: visible.length,
    perSection: report.sections.map((s) => ({
      title: s.title,
      count: visible.filter((r) => r.section === s.title).length,
    })),
  };
}

export interface JiraSummary {
  missingFromQc: number;
  mergedInQc: number;
  openPrs: number;
  perGroup: { title: string; count: number }[];
}

export function summarizeJira(report: JiraReport): JiraSummary {
  const prs = report.groups.flatMap((g) => g.tickets).flatMap((t) => t.prs);
  return {
    missingFromQc: prs.filter((pr) => pr.inQc === false).length,
    mergedInQc: prs.filter((pr) => pr.inQc === true).length,
    openPrs: prs.filter((pr) => pr.state === 'open').length,
    perGroup: report.groups.map((g) => ({ title: g.title, count: g.tickets.length })),
  };
}
