import { createContext, useContext } from 'react';
import type { ReportKind } from './reportKinds';

export interface RefreshStatus {
  running: Set<ReportKind>;
  errors: Partial<Record<ReportKind, string>>;
  /** Which command regenerates each kind, as reported by the server. */
  commandOf: Partial<Record<ReportKind, string>>;
  /** Kinds fetchable straight from an upstream API — seconds, not an agent run. */
  apiKinds: Set<ReportKind>;
  /**
   * Kinds this app can refresh at all. Mail and calendar are not among them: reading the
   * inboxes needs the Chrome extension, which only attaches to the user's own interactive
   * session, so those reports are written by running the skill there.
   */
  canRefresh: (kind: ReportKind) => boolean;
  run: (kind: ReportKind) => Promise<void>;
}

export const RefreshContext = createContext<RefreshStatus | null>(null);

export const useRefresh = (): RefreshStatus => {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used inside RefreshProvider');
  return ctx;
};
