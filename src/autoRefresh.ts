/**
 * Whether the dashboard pulls stale reports when it is opened, and what counts as stale.
 *
 * Four hours is chosen so that opening the dashboard in the morning always refetches — an
 * overnight report is worse than useless, because it looks current. Reopening a tab an hour
 * later refetches nothing.
 */
export const STALE_HOURS = 4;

const KEY = 'reporto.autoRefresh';

/** Default on: the whole point is not having to remember to press update. */
export const autoRefreshEnabled = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    // Private windows and blocked site data throw on access; the feature is not worth an
    // error, so fall back to the default.
    return true;
  }
};

export const setAutoRefresh = (enabled: boolean): void => {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    /* nothing to persist to; the current session still honours the choice */
  }
};

export const hoursSince = (iso: string | undefined): number =>
  iso === undefined ? Number.POSITIVE_INFINITY : (Date.now() - new Date(iso).getTime()) / 3_600_000;
