import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { ReportKind } from '../reportKinds';
import { useRefresh } from '../refreshContext';
import { autoRefreshEnabled } from '../autoRefresh';
import { isStale, kindsForRoute } from '../freshness';

interface LiveRefreshProps {
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
  /**
   * Re-read the report files from disk. Cheap and local — no API — so it runs on every wake
   * before anything is judged stale: a cron pull, or `npm run pull`, writes new files this tab
   * knows nothing about, and re-reading is how they appear without pressing a button.
   */
  onWake: () => void;
}

/** Never re-attempt the same kind more often than this, whatever the window does. */
const MIN_GAP_MS = 60_000;

/**
 * One wake, one pass. Returning to a tab fires `focus` and `visibilitychange` together, so
 * without this the file re-read ran twice for a single tab-switch — measured, 14 requests where
 * 7 were wanted.
 */
const WAKE_COALESCE_MS = 1_000;

/**
 * Keeps what is on screen current, without polling on a timer.
 *
 * Nothing here pushes: GitHub and Jira webhooks need a public URL, Google Calendar needs a
 * verified HTTPS callback, and this server is loopback-only by design. Slack could push over
 * Socket Mode, and that is worth doing on its own — but a timer ticking against five APIs
 * while the tab sits in the background is the wrong shape whatever Slack supports.
 *
 * So the trigger is attention rather than time: on load, on navigation, and when the window
 * regains focus, the reports *this route shows* are refetched if they are past their own
 * freshness ceiling. A dashboard opened after lunch is current by the time it has painted; a
 * tab left open for a week costs nothing until somebody clicks back into it.
 *
 * Three guards, each for a failure seen while building this: kinds run one at a time so a
 * focus never fires five pulls at once, a per-kind minimum gap survives a window that flaps
 * focus, and an undefined stamp only counts as stale once at least one report has loaded —
 * before that every stamp is undefined, which would refetch everything on every boot.
 */
export const LiveRefresh = ({ generatedAt, onWake }: LiveRefreshProps) => {
  const { canRefresh, running, run } = useRefresh();
  const { pathname } = useLocation();
  const lastTried = useRef<Partial<Record<ReportKind, number>>>({});
  const lastWake = useRef(0);
  const busy = useRef(false);

  const sweep = useCallback(async () => {
    if (busy.current || !autoRefreshEnabled()) return;
    // Before the first report lands there is nothing to judge; judging anyway refetches all.
    if (!Object.values(generatedAt).some(Boolean)) return;

    const due = kindsForRoute(pathname).filter(
      (kind) =>
        canRefresh(kind) &&
        !running.has(kind) &&
        isStale(kind, generatedAt[kind]) &&
        Date.now() - (lastTried.current[kind] ?? 0) >= MIN_GAP_MS,
    );
    if (due.length === 0) return;

    busy.current = true;
    try {
      for (const kind of due) {
        lastTried.current[kind] = Date.now();
        // Sequential on purpose: these share one Jira token and one gh process, and the Jira
        // pull is two requests deep already.
        await run(kind);
      }
    } finally {
      busy.current = false;
    }
  }, [canRefresh, generatedAt, pathname, run, running]);

  useEffect(() => {
    void sweep();

    /*
     * Both halves of "attention" in one place. This module used to own only the pulling while
     * `RefreshProvider` separately re-read every file on the same two events — one tab-switch
     * fired both handlers, and `visibilitychange` fires alongside `focus`. Re-read first
     * (local, cheap, catches a cron run), then pull only what is past its ceiling.
     */
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastWake.current < WAKE_COALESCE_MS) return;
      lastWake.current = Date.now();
      onWake();
      void sweep();
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [onWake, sweep]);

  return null;
};
