import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ReportKind } from './reportKinds';
import type { Capability } from './capabilitiesContext';
import { CapabilitiesContext } from './capabilitiesContext';

/**
 * What this machine can do, fetched once from the dev server.
 *
 * The point is negative: a card for a report whose credentials are missing fails on the
 * button and then says "no report yet", which reads as a bug rather than as "you never set
 * this up". So the app asks first and hides what cannot work.
 *
 * A production build is a static site with no API, so the fetch fails and everything stays
 * visible — the same fallback as the refresh provider.
 */
export const CapabilitiesProvider = ({ children }: { children: ReactNode }) => {
  const [modules, setModules] = useState<Capability[]>([]);
  const [statusAging, setStatusAging] = useState<Record<string, number>>({});
  const [stuckStatuses, setStuckStatuses] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body:
            | {
                modules?: Capability[];
                statusAging?: Record<string, number>;
                stuckStatuses?: string[];
              }
            | null,
        ) => {
          if (cancelled) return;
          if (body?.modules) setModules(body.modules);
          if (body?.statusAging) setStatusAging(body.statusAging);
          if (body?.stuckStatuses) setStuckStatuses(body.stuckStatuses);
          setLoaded(true);
        },
      )
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const of = useCallback(
    (kind: ReportKind) => modules.find((module) => module.kind === kind) ?? null,
    [modules],
  );

  const usable = useCallback(
    (kind: ReportKind) => {
      const module = of(kind);
      // Unknown means the server never spoke, not that the module is broken.
      if (!module) return true;
      return module.configured && module.enabled;
    },
    [of],
  );

  const post = useCallback(async (path: string, body: unknown) => {
    const res = await fetch(`/api/settings${path}`, {
      method: 'POST',
      // The custom header is half the cross-site guard: it forces a preflight the dev
      // server never answers, so no other page can write settings or secrets here.
      headers: { 'Content-Type': 'application/json', 'X-Reporto-Write': '1' },
      body: JSON.stringify(body),
    });
    const answer = (await res.json()) as { error?: string; modules?: Capability[] };
    if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
    // Every write answers with the whole standing, so one round trip keeps the page honest.
    if (answer.modules) setModules(answer.modules);
  }, []);

  const setEnabled = useCallback(
    (kind: ReportKind, enabled: boolean) => post(`/modules/${kind}`, { enabled }),
    [post],
  );

  const saveSecret = useCallback(
    (name: string, value: string) => post(`/secrets/${name}`, { value }),
    [post],
  );

  const value = useMemo(
    () => ({ modules, statusAging, stuckStatuses, usable, of, loaded, setEnabled, saveSecret }),
    [modules, statusAging, stuckStatuses, usable, of, loaded, setEnabled, saveSecret],
  );

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
};
