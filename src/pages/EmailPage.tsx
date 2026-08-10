import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EmailReport, JiraReport } from '../types';
import type { DayDb } from '../db';
import { initDay, loadDay, patchTodoRemote, saveDay } from '../db';
import { EmailReportView } from '../components/EmailReportView';

interface EmailPageProps {
  report: EmailReport | null;
  jira: JiraReport | null;
}

export const EmailPage = ({ report, jira }: EmailPageProps) => {
  const [db, setDb] = useState<DayDb | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (!report) return;
    let cancelled = false;
    (async () => {
      try {
        let day = await loadDay(report.date);
        if (!day) {
          day = initDay(report.date, report, jira);
          await saveDay(day);
        }
        if (!cancelled) setDb(day);
      } catch (err) {
        if (!cancelled) setDbError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [report, jira]);

  const patchTodo = (id: string, patch: { checked?: boolean; deleted?: boolean }) => {
    if (!report) return;
    const checkedAt =
      patch.checked === undefined ? undefined : patch.checked ? new Date().toISOString() : null;
    setDb((prev) =>
      prev
        ? {
            ...prev,
            todos: prev.todos.map((t) =>
              t.id === id ? { ...t, ...patch, checkedAt: checkedAt ?? t.checkedAt } : t,
            ),
          }
        : prev,
    );
    void patchTodoRemote(report.date, { id, ...patch, checkedAt }).catch((err) =>
      setDbError(String(err)),
    );
  };

  return (
    <main className="grid">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      {dbError && <p className="status error">DB error: {dbError}</p>}
      {report ? (
        <EmailReportView
          report={report}
          todos={db?.todos ?? []}
          onToggle={(id, checked) => patchTodo(id, { checked })}
          onDelete={(id) => patchTodo(id, { deleted: true })}
        />
      ) : (
        <p className="status">No email report.</p>
      )}
    </main>
  );
};
