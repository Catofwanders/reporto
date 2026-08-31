/**
 * `fetch` with a deadline, for everything this app asks the dev server.
 *
 * The server now gives up on a hung upstream, but that only fixes half of it: a request the
 * browser makes to a dev server that has died, or through a socket that stops answering, waits
 * forever too — and the spinner it started waits with it. There is no state in which spinning
 * for the rest of the day is better than saying what did not answer.
 *
 * Timeouts are per call site, because the honest budget differs by two orders of magnitude: a
 * report file off local disk answers in milliseconds, and a full Jira pull legitimately takes
 * twenty seconds or more.
 */

/** Reads: a local file or a settled endpoint. Anything slower than this is broken. */
export const READ_TIMEOUT_MS = 15_000;

/** Writes that call an API behind them — a transition, a reply, a PR action. */
export const ACTION_TIMEOUT_MS = 45_000;

/** A pull talks to Jira, GitHub, Slack or Google and may page through all of them. */
export const PULL_TIMEOUT_MS = 180_000;

const label = (input: string) => {
  const path = input.split('?')[0];
  return path.length > 48 ? `${path.slice(0, 47)}…` : path;
};

/**
 * Throws an `Error` naming the endpoint and the budget it passed, so the message a card shows
 * says which request gave up rather than the browser's bare "Failed to fetch".
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  ms: number = READ_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`${label(input)} gave no answer within ${Math.round(ms / 1000)}s`);
    }
    throw err;
  }
}
