/** Generous on purpose: a big JQL search is slow, and a false timeout is worse than a wait. */
export const HTTP_TIMEOUT_MS: number;

/** `gh` shells out, authenticates and may paginate, so it gets longer than a bare request. */
export const GH_TIMEOUT_MS: number;

/**
 * `fetch` with a deadline. A timeout is reported as a named host that did not answer, because
 * "fetch failed" after thirty seconds reads exactly like bad credentials.
 */
export function fetchWithTimeout(
  url: string | URL,
  options?: RequestInit,
  ms?: number,
): Promise<Response>;
