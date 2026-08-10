import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import type {
  CalendarReport,
  EmailReport,
  JiraReport,
  PrsReport,
  ReportIndex,
} from './types';
import type { ReportKind } from './reportKinds';
import { REPORT_KINDS } from './reportKinds';
import { RefreshProvider } from './refresh';
import { assertReport } from './reportSchema';
import { ActionBar } from './components/ActionBar';
import { ErrorBoundary } from './components/ErrorBoundary';
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

const EMPTY_INDEX: ReportIndex = { latest: {}, history: [] };

/**
 * A missing index means a fresh checkout with no data yet — report data is untracked,
 * so that is expected and yields an empty index. Any other failure (unreachable server,
 * half-written JSON) must surface instead of masquerading as "no reports".
 */
async function fetchIndex(): Promise<ReportIndex> {
  const res = await fetch(`${BASE}index.json`, { cache: 'no-store' });
  if (res.status === 404) return EMPTY_INDEX;
  if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
  return (await res.json()) as ReportIndex;
}

interface Reports {
  email: EmailReport | null;
  jira: JiraReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

const EMPTY: Reports = { email: null, jira: null, calendar: null, prs: null };

type KindErrors = Partial<Record<ReportKind, string>>;

async function fetchKind(index: ReportIndex, kind: ReportKind) {
  const file = index.latest[kind];
  if (!file) return null;
  const value = await fetchJson<unknown>(file);
  assertReport(kind, value);
  return value as EmailReport | JiraReport | CalendarReport | PrsReport;
}

export const App = () => {
  const [reports, setReports] = useState<Reports>(EMPTY);
  const [loadErrors, setLoadErrors] = useState<KindErrors>({});
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Loads the given kinds independently: one broken report must not blank the others,
   * and a failed fetch keeps the last good data on screen rather than nulling it.
   */
  const load = useCallback(async (kinds: ReportKind[]) => {
    let index: ReportIndex;
    try {
      index = await fetchIndex();
      setIndexError(null);
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : String(err));
      return;
    }

    const settled = await Promise.allSettled(kinds.map((kind) => fetchKind(index, kind)));
    setReports((prev) => {
      const next = { ...prev };
      kinds.forEach((kind, i) => {
        const result = settled[i];
        // Each kind's file matches its own report shape; the index keys them by kind.
        if (result.status === 'fulfilled') next[kind] = result.value as never;
      });
      return next;
    });
    setLoadErrors((prev) => {
      const next = { ...prev };
      kinds.forEach((kind, i) => {
        const result = settled[i];
        next[kind] =
          result.status === 'rejected'
            ? result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
            : undefined;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load([...REPORT_KINDS]).finally(() => {
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

  const failed = REPORT_KINDS.filter((kind) => loadErrors[kind]);

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
          {indexError && <p className="status error">Could not read the report index: {indexError}</p>}
          {failed.length > 0 && (
            <p className="status error">
              {failed.map((kind) => `${kind}: ${loadErrors[kind]}`).join(' · ')}
            </p>
          )}

          {!loading && (
            <ErrorBoundary>
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
            </ErrorBoundary>
          )}
        </div>
      </RefreshProvider>
    </BrowserRouter>
  );
};

export default App;
