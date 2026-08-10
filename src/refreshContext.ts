import { createContext, useContext } from 'react';
import type { ReportKind } from './reportKinds';

export interface RefreshStatus {
  running: Set<ReportKind>;
  errors: Partial<Record<ReportKind, string>>;
  /** Which command regenerates each kind, as reported by the server. */
  commandOf: Partial<Record<ReportKind, string>>;
  /** headless = spawned run; handoff = opens an interactive terminal session. */
  modeOf: Partial<Record<ReportKind, 'headless' | 'handoff'>>;
  /** Kinds whose terminal session was opened and is presumably still being worked on. */
  handedOff: Set<ReportKind>;
  run: (kind: ReportKind) => Promise<void>;
}

export const RefreshContext = createContext<RefreshStatus | null>(null);

export const useRefresh = (): RefreshStatus => {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used inside RefreshProvider');
  return ctx;
};
