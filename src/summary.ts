import type { EmailReport } from './types';
import type { Todo } from './db';
import { emailRows } from './emailRows';

export interface EmailSummary {
  needAction: number;
  done: number;
  items: number;
  perSection: { title: string; count: number }[];
}

export function summarizeEmail(report: EmailReport, todos: Todo[] = []): EmailSummary {
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const visible = emailRows(report)
    .map((row) => ({ ...row, todo: todoById.get(row.id) }))
    .filter((row) => !row.todo?.deleted);
  return {
    needAction: visible.filter((r) => r.item.action && !r.todo?.checked).length,
    done: visible.filter((r) => r.todo?.checked).length,
    items: visible.length,
    perSection: report.sections.map((s) => ({
      title: s.title,
      count: visible.filter((r) => r.sectionTitle === s.title).length,
    })),
  };
}
