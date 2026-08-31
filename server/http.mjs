/**
 * Outbound requests, with a deadline.
 *
 * Every fetch here went out with no timeout, which is fine until the socket stops answering
 * rather than failing — a dropped VPN, a proxy holding the connection, a provider having a bad
 * minute. Node's fetch waits forever for that, and the consequences are not local: the pull
 * never resolves, so the endpoint never answers, so the button spins for the rest of the day;
 * and `npm run pull` from cron hangs until the next run overlaps it.
 *
 * A deadline turns all of that into an ordinary failed pull, which every layer above already
 * knows how to show.
 */

/** Generous on purpose: a big JQL search is slow, and a false timeout is worse than a wait. */
export const HTTP_TIMEOUT_MS = 30_000

/** `gh` shells out, authenticates and may paginate, so it gets longer than a bare request. */
export const GH_TIMEOUT_MS = 60_000

const hostOf = (url) => {
  try {
    return new URL(String(url)).host
  } catch {
    return String(url).slice(0, 60)
  }
}

/**
 * `fetch` that gives up.
 *
 * The timeout is reported as what it is — a host that did not answer — because "fetch failed"
 * on a pull that took thirty seconds is indistinguishable from bad credentials, and the two
 * want opposite responses from whoever reads the error.
 */
export async function fetchWithTimeout(url, options = {}, ms = HTTP_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(ms) })
  } catch (err) {
    const name = err?.name ?? ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`no answer from ${hostOf(url)} within ${Math.round(ms / 1000)}s`)
    }
    throw err
  }
}
