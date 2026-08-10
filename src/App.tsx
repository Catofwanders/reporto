import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import type {
  CalendarReport,
  EmailReport,
  JiraReport,
  PrsReport,
  ReportIndex,
} from './types';
import type { ReportKind } from './refresh';
import { RefreshProvider } from './refresh';
import { ActionBar } from './components/ActionBar';
import { HomePage } from './pages/HomePage';
import { EmailPage } from './pages/EmailPage';
import { JiraPage } from './pages/JiraPage';
import { CalendarPage } from './pages/CalendarPage';

const BASE = `${import.meta.env.BASE_URL}reports/`;

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}${file}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Report data is local-only and untracked, so a fresh checkout has no index yet:
// start empty and let the update buttons generate it.
const EMPTY_INDEX: ReportIndex = { latest: {}, history: [] };

async function fetchIndex(): Promise<ReportIndex> {
  try {
    return await fetchJson<ReportIndex>('index.json');
  } catch {
    return EMPTY_INDEX;
  }
}

interface Reports {
  email: EmailReport | null;
  jira: JiraReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

const EMPTY: Reports = { email: null, jira: null, calendar: null, prs: null };

async function fetchKind(index: ReportIndex, kind: ReportKind) {
  const file = index.latest[kind];
  if (!file) return null;
  return fetchJson<EmailReport | JiraReport | CalendarReport | PrsReport>(file);
}

export const App = () => {
  const [reports, setReports] = useState<Reports>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (kinds: ReportKind[]) => {
    const index = await fetchIndex();
    const loaded = await Promise.all(kinds.map((kind) => fetchKind(index, kind)));
    setReports((prev) => {
      const next = { ...prev };
      kinds.forEach((kind, i) => {
        // Each kind's file matches its own report shape; the index keys them by kind.
        next[kind] = loaded[i] as never;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(['email', 'jira', 'calendar', 'prs'])
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const generatedAt = {
    email: reports.email?.generatedAt,
    jira: reports.jira?.generatedAt,
    calendar: reports.calendar?.generatedAt,
    prs: reports.prs?.generatedAt,
  };

  return (
    <BrowserRouter>
      <RefreshProvider onReload={load}>
        <div className="wrap">
          <header className="app-head">
            <h1>
              <Link to="/" className="home-link">
                reporto
              </Link>
            </h1>
            <span className="app-sub">email + jira + calendar dashboard</span>
            <ActionBar generatedAt={generatedAt} />
          </header>

          {loading && <p className="status">Loading reports…</p>}
          {error && <p className="status error">Failed to load reports: {error}</p>}
          {!loading && !error && (
            <Routes>
              <Route
                path="/"
                element={
                  <HomePage
                    email={reports.email}
                    jira={reports.jira}
                    calendar={reports.calendar}
                    prs={reports.prs}
                  />
                }
              />
              <Route
                path="/email"
                element={<EmailPage report={reports.email} jira={reports.jira} />}
              />
              <Route path="/jira" element={<JiraPage report={reports.jira} />} />
              <Route path="/calendar" element={<CalendarPage report={reports.calendar} />} />
            </Routes>
          )}
        </div>
      </RefreshProvider>
    </BrowserRouter>
  );
};

export default App;
