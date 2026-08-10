import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ReportKind = 'email' | 'jira' | 'calendar' | 'prs';

export const REPORT_KINDS: ReportKind[] = ['email', 'calendar', 'jira', 'prs'];

export const KIND_META: Record<ReportKind, { label: string; icon: string; command: string }> = {
  email: { label: 'Mail', icon: '📬', command: '/email' },
  calendar: { label: 'Calendar', icon: '📅', command: '/email' },
  jira: { label: 'Jira', icon: '🎫', command: '/jira' },
  prs: { label: 'PRs', icon: '🔀', command: '/jira' },
};

interface RefreshResult {
  ok: boolean;
  writes?: ReportKind[];
  error?: string;
  durationMs?: number;
}

interface RefreshState {
  running: Set<ReportKind>;
  errors: Partial<Record<ReportKind, string>>;
  run: (kind: ReportKind) => Promise<void>;
}

const RefreshContext = createContext<RefreshState | null>(null);

interface RefreshProviderProps {
  onReload: (kinds: ReportKind[]) => Promise<void>;
  children: React.ReactNode;
}

export const RefreshProvider = ({ onReload, children }: RefreshProviderProps) => {
  const [running, setRunning] = useState<Set<ReportKind>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<ReportKind, string>>>({});

  const run = useCallback(
    async (kind: ReportKind) => {
      setRunning((prev) => new Set(prev).add(kind));
      setErrors((prev) => ({ ...prev, [kind]: undefined }));
      try {
        const res = await fetch(`/api/refresh/${kind}`, {
          method: 'POST',
          headers: { 'X-Reporto-Write': '1' },
        });
        const body = (await res.json()) as RefreshResult;
        if (!res.ok || !body.ok) throw new Error(body.error ?? `exit ${res.status}`);
        await onReload(body.writes ?? [kind]);
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [kind]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setRunning((prev) => {
          const next = new Set(prev);
          next.delete(kind);
          return next;
        });
      }
    },
    [onReload],
  );

  const value = useMemo(() => ({ running, errors, run }), [running, errors, run]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
};

export const useRefresh = () => {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used inside RefreshProvider');
  return ctx;
};
