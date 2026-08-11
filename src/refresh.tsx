import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReportKind } from './reportKinds';
import { REPORT_KINDS } from './reportKinds';
import { RefreshContext } from './refreshContext';

interface RefreshResult {
  ok?: boolean;
  writes?: ReportKind[];
  error?: string;
}

const POLL_MS = 3000;

interface RefreshProviderProps {
  onReload: (kinds: ReportKind[]) => Promise<void>;
  children: React.ReactNode;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const RefreshProvider = ({ onReload, children }: RefreshProviderProps) => {
  const [running, setRunning] = useState<Set<ReportKind>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<ReportKind, string>>>({});
  const [commandOf, setCommandOf] = useState<Partial<Record<ReportKind, string>>>({});
  const [apiKinds, setApiKinds] = useState<Set<ReportKind>>(new Set());

  // The kind → command map lives on the server; without it we cannot tell which cards
  // a single run covers.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/refresh')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { commandOf?: Record<string, string> } | null) => {
        if (!cancelled && body?.commandOf) setCommandOf(body.commandOf as typeof commandOf);
      })
      .catch(() => {
        /* falls back to per-kind behaviour */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Kinds with a direct API puller: preferred over any agent run, since they answer in
  // about a second and fetch exactly what the caller asked for.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/pull')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { kinds?: string[] } | null) => {
        if (!cancelled && body?.kinds) setApiKinds(new Set(body.kinds as ReportKind[]));
      })
      .catch(() => {
        /* no pull API — everything falls back to the skill path */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setBusy = useCallback((kinds: ReportKind[], busy: boolean) => {
    setRunning((prev) => {
      const next = new Set(prev);
      kinds.forEach((kind) => (busy ? next.add(kind) : next.delete(kind)));
      return next;
    });
  }, []);

  const run = useCallback(
    async (kind: ReportKind) => {
      const command = commandOf[kind];
      // Every card backed by the same command is refreshed by this one run.
      const siblings = command
        ? REPORT_KINDS.filter((k) => commandOf[k] === command)
        : [kind];

      // An API pull rewrites only its own report, so it must not mark siblings busy.
      const affected = apiKinds.has(kind) ? [kind] : siblings;
      setBusy(affected, true);
      setErrors((prev) => {
        const next = { ...prev };
        siblings.forEach((k) => delete next[k]);
        return next;
      });

      try {
        if (apiKinds.has(kind)) {
          const res = await fetch(`/api/pull/${kind}`, {
            method: 'POST',
            headers: { 'X-Reporto-Write': '1' },
          });
          const body = (await res.json()) as RefreshResult;
          if (!res.ok || !body.ok) throw new Error(body.error ?? `exit ${res.status}`);
          await onReload(body.writes ?? [kind]);
          return;
        }

        const res = await fetch(`/api/refresh/${kind}`, {
          method: 'POST',
          headers: { 'X-Reporto-Write': '1' },
        });
        const body = (await res.json()) as RefreshResult;

        if (res.status === 409) {
          // Someone already started this command: wait it out, then pick up its output
          // instead of reporting a failure the user cannot act on.
          while (true) {
            await sleep(POLL_MS);
            const status = await fetch('/api/refresh').then(
              (r) => r.json() as Promise<{ running: string[] }>,
            );
            if (!command || !status.running.includes(command)) break;
          }
          await onReload(siblings);
          return;
        }

        if (!res.ok || !body.ok) throw new Error(body.error ?? `exit ${res.status}`);
        await onReload(body.writes ?? siblings);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrors((prev) => {
          const next = { ...prev };
          siblings.forEach((k) => (next[k] = message));
          return next;
        });
      } finally {
        setBusy(affected, false);
      }
    },
    [apiKinds, commandOf, onReload, setBusy],
  );

  // Mail and calendar are refreshed by running the skill in the user's own session, so
  // returning to the tab is the moment their new files appear.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void onReload([...REPORT_KINDS]);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [onReload]);

  const canRefresh = useCallback(
    (kind: ReportKind) => apiKinds.has(kind) || commandOf[kind] !== undefined,
    [apiKinds, commandOf],
  );

  const value = useMemo(
    () => ({ running, errors, commandOf, apiKinds, canRefresh, run }),
    [running, errors, commandOf, apiKinds, canRefresh, run],
  );
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
};
