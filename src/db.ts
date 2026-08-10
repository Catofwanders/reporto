import type { EmailReport, JiraReport } from './types';

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

export async function listDays(): Promise<string[]> {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`list days: HTTP ${res.status}`);
  return res.json() as Promise<string[]>;
}

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

export function todoId(sectionTitle: string, subject: string): string {
  return `${sectionTitle}::${subject}`;
}

export function initDay(
  date: string,
  email: EmailReport | null,
  jira: JiraReport | null,
): DayDb {
  const todos: Todo[] =
    email?.sections.flatMap((section) =>
      section.items.map((item) => ({
        id: todoId(section.title, item.subject),
        label: item.subject,
        action: item.action,
        checked: false,
        deleted: false,
        checkedAt: null,
      })),
    ) ?? [];
  return { date, email, jira, todos };
}
