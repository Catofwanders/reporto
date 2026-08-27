import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type {
  CalendarReport,
  JiraReport,
  PrsReport,
  ReportIndex,
  ReviewsReport,
  SlackReport,
  StatsReport,
} from './types';
import type { ReportKind } from './reportKinds';
import { REPORT_KINDS } from './reportKinds';
import { RefreshProvider } from './refresh';
import { CapabilitiesProvider } from './capabilities';
import { assertReport } from './reportSchema';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ModuleGate } from './components/ModuleGate';
import { HomePage } from './pages/HomePage';
import { JiraPage } from './pages/JiraPage';
import { PrsPage } from './pages/PrsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SlackPage } from './pages/SlackPage';
import { CommandsPage } from './pages/CommandsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';

/*
 * The only route that draws charts, and Recharts is most of the bundle — 925KB raw before
 * this, of which every page that never plots anything was paying for the library. Loading it
 * with the route puts it in its own chunk. Named export, hence the mapping: `lazy` wants a
 * module whose default is the component.
 */
const StatsPage = lazy(() =>
  import('./pages/StatsPage').then((module) => ({ default: module.StatsPage })),
);

const BASE = `${import.meta.env.BASE_URL}reports/`;

/**
 * `res.ok` is not enough: the dev server's SPA fallback answers a missing report with
 * `200 text/html`, so a stale index entry used to surface as "Unexpected token '<'"
 * from JSON.parse. Check what came back before trusting it.
 */
async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}${file}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error(`${file}: missing — the server returned the app shell, not JSON`);
  }
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
  if (!res.headers.get('content-type')?.includes('json')) return EMPTY_INDEX;
  return (await res.json()) as ReportIndex;
}

interface Reports {
  jira: JiraReport | null;
  stats: StatsReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

const EMPTY: Reports = {
  jira: null,
  calendar: null,
  prs: null,
  reviews: null,
  slack: null,
  stats: null,
};

type KindErrors = Partial<Record<ReportKind, string>>;

/**
 * Newest first: `latest`, then each day in `history` that names this kind. A pointer to a
 * report that is gone — deleted by hand, or written on a machine whose reports never came
 * across — then costs yesterday's data rather than the whole card.
 */
function candidates(index: ReportIndex, kind: ReportKind): string[] {
  const files = [index.latest[kind], ...index.history.map((day) => day[kind])];
  return [...new Set(files.filter((file): file is string => Boolean(file)))];
}

async function fetchKind(index: ReportIndex, kind: ReportKind) {
  const files = candidates(index, kind);
  if (files.length === 0) return null;
  let firstError: unknown;
  for (const file of files) {
    try {
      const value = await fetchJson<unknown>(file);
      assertReport(kind, value);
      return value as JiraReport | CalendarReport | PrsReport | ReviewsReport | StatsReport;
    } catch (err) {
      firstError ??= err;
    }
  }
  throw firstError;
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
    stats: reports.stats?.generatedAt,
    reviews: reports.reviews?.generatedAt,
    slack: reports.slack?.generatedAt,
    jira: reports.jira?.generatedAt,
    calendar: reports.calendar?.generatedAt,
    prs: reports.prs?.generatedAt,
  };

  const failed = REPORT_KINDS.filter((kind) => loadErrors[kind]);

  return (
    <BrowserRouter>
      <CapabilitiesProvider>
        <RefreshProvider onReload={load}>
          <AppShell generatedAt={generatedAt} jira={reports.jira} prs={reports.prs}>
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
                        jira={reports.jira}
                        reviews={reports.reviews}
                        slack={reports.slack}
                        calendar={reports.calendar}
                        prs={reports.prs}
                      />
                    }
                  />
                  <Route
                    path="/jira"
                    element={
                      <ModuleGate kind="jira">
                        <JiraPage report={reports.jira} prs={reports.prs} />
                      </ModuleGate>
                    }
                  />
                  <Route
                    path="/prs"
                    element={
                      <ModuleGate kind="prs">
                        <PrsPage report={reports.prs} />
                      </ModuleGate>
                    }
                  />
                  <Route
                    path="/reviews"
                    element={
                      <ModuleGate kind="reviews">
                        <ReviewsPage report={reports.reviews} jira={reports.jira} />
                      </ModuleGate>
                    }
                  />
                  <Route
                    path="/slack"
                    element={
                      <ModuleGate kind="slack">
                        <SlackPage report={reports.slack} />
                      </ModuleGate>
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      <ModuleGate kind="calendar">
                        <CalendarPage report={reports.calendar} />
                      </ModuleGate>
                    }
                  />
                  <Route
                    path="/stats"
                    element={
                      <ModuleGate kind="stats">
                        {/* Scoped to this route: a Suspense around the whole switch would
                            blank the page being left rather than the one arriving. */}
                        <Suspense fallback={<p className="status">Loading the charts…</p>}>
                          <StatsPage report={reports.stats} />
                        </Suspense>
                      </ModuleGate>
                    }
                  />
                  <Route
                    path="/projects"
                    element={
                      <ProjectsPage jira={reports.jira} prs={reports.prs} stats={reports.stats} />
                    }
                  />
                  <Route
                    path="/projects/:id"
                    element={<ProjectPage jira={reports.jira} prs={reports.prs} />}
                  />
                  <Route path="/commands" element={<CommandsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  {/* /email was a route until the mail views were removed; a bookmark to it
                      lands on the dashboard rather than on a blank page. */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            )}
          </AppShell>
        </RefreshProvider>
      </CapabilitiesProvider>
    </BrowserRouter>
  );
};

export default App;
