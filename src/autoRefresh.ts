/**
 * The one switch behind the refresh-on-attention behaviour: whether looking at a page is
 * allowed to refetch what it shows. What counts as stale lives in `freshness.ts`, per report.
 *
 * A browser preference rather than config, because it is about this browser's habits, not
 * about the machine — and `localStorage` throws in a private window, so every access is
 * guarded and falls back to the default.
 */
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
