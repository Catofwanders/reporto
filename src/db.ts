import type { EmailReport, JiraReport } from './types';
import { emailRows } from './emailRows';

export interface Todo {
  id: string;
  label: string;
  action: string | null;
  checked: boolean;
  deleted: boolean;
  checkedAt: string | null;
}

export interface DayDb {
  date: string;
  email: EmailReport | null;
  jira: JiraReport | null;
  todos: Todo[];
}

const API = '/api/db';

// Marks writes as coming from this app; the dev server rejects state-changing
// requests without it (see rejectCrossSite in vite.config.ts).
const WRITE_HEADERS = { 'Content-Type': 'application/json', 'X-Reporto-Write': '1' };

export async function loadDay(date: string): Promise<DayDb | null> {
  const res = await fetch(`${API}/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`load day ${date}: HTTP ${res.status}`);
  return res.json() as Promise<DayDb>;
}

export async function saveDay(db: DayDb): Promise<void> {
  const res = await fetch(`${API}/${db.date}`, {
    method: 'PUT',
    headers: WRITE_HEADERS,
    body: JSON.stringify(db, null, 2),
  });
  if (!res.ok) throw new Error(`save day ${db.date}: HTTP ${res.status}`);
}

export interface TodoPatch {
  id: string;
  checked?: boolean;
  deleted?: boolean;
  checkedAt?: string | null;
}

export async function patchTodoRemote(date: string, patch: TodoPatch): Promise<void> {
  const res = await fetch(`${API}/${date}/todo`, {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch todo: HTTP ${res.status}`);
}

export function initDay(
  date: string,
  email: EmailReport | null,
  jira: JiraReport | null,
): DayDb {
  const todos: Todo[] = email
    ? emailRows(email).map((row) => ({
        id: row.id,
        label: row.item.subject,
        action: row.item.action,
        checked: false,
        deleted: false,
        checkedAt: null,
      }))
    : [];
  return { date, email, jira, todos };
}

/**
 * Adds todo rows for report items that have none yet — a second /email run on the same
 * day brings new mail, and without this those rows would be unpatchable. Existing
 * checked/deleted flags are left alone; returns the reconciled list.
 */
export async function reconcileTodos(date: string, email: EmailReport): Promise<Todo[]> {
  const rows = emailRows(email).map((row) => ({
    id: row.id,
    label: row.item.subject,
    action: row.item.action,
  }));
  const res = await fetch(`${API}/${date}/reconcile`, {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ todos: rows }),
  });
  if (!res.ok) throw new Error(`reconcile todos: HTTP ${res.status}`);
  const body = (await res.json()) as { todos: Todo[] };
  return body.todos;
}
