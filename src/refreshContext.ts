import { createContext, useContext } from 'react';
import type { ReportKind } from './reportKinds';

export interface RefreshStatus {
  running: Set<ReportKind>;
  errors: Partial<Record<ReportKind, string>>;
  /** Which command regenerates each kind, as reported by the server. */
  commandOf: Partial<Record<ReportKind, string>>;
  run: (kind: ReportKind) => Promise<void>;
}

export const RefreshContext = createContext<RefreshStatus | null>(null);

export const useRefresh = (): RefreshStatus => {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used inside RefreshProvider');
  return ctx;
};
