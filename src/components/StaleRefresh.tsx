import { useEffect, useRef } from 'react';
import type { ReportKind } from '../reportKinds';
import { REPORT_KINDS } from '../reportKinds';
import { useRefresh } from '../refreshContext';
import { STALE_HOURS, autoRefreshEnabled, hoursSince } from '../autoRefresh';

interface StaleRefreshProps {
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
}

/**
 * Pulls whatever is stale, once, when the dashboard is opened.
 *
 * Renders nothing: the sidebar rows already say "updating…" while it runs, so the work is
 * visible without a second announcement. Only kinds with an API puller are touched — an
 * agent run is far too expensive to start unasked — and only once per session, so a
 * navigation between pages never refetches.
 */
export const StaleRefresh = ({ generatedAt }: StaleRefreshProps) => {
  const { apiKinds, canRefresh, run } = useRefresh();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || apiKinds.size === 0 || !autoRefreshEnabled()) return;

    const stale = REPORT_KINDS.filter(
      (kind) =>
        apiKinds.has(kind) && canRefresh(kind) && hoursSince(generatedAt[kind]) >= STALE_HOURS,
    );
    // Wait for the reports to have loaded before judging them stale: before that every
    // stamp is undefined, which would refetch everything on every boot.
    const known = REPORT_KINDS.some((kind) => generatedAt[kind]);
    if (!known || stale.length === 0) return;

    done.current = true;
    for (const kind of stale) void run(kind);
  }, [apiKinds, canRefresh, generatedAt, run]);

  return null;
};
