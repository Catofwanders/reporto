/**
 * Run an async job over a list, a few at a time.
 *
 * The pullers were fully sequential, which was the right first move — a burst of forty requests
 * on one token is how a pull earns a 429 — but "one at a time" and "all at once" are not the
 * only options. Four in flight is well inside Jira's and Slack's tier limits and turns the two
 * slowest pulls from twenty-odd seconds into five.
 *
 * Order is preserved: results come back in the order the items were given, whatever order they
 * finished in. A job that throws yields `undefined` for that item rather than failing the batch,
 * because one unreadable changelog must cost that ticket's pill and nothing else.
 */
export async function pooled(items, limit, job) {
  const list = [...items]
  const out = new Array(list.length)
  let next = 0

  const worker = async () => {
    while (true) {
      const at = next++
      if (at >= list.length) return
      try {
        out[at] = await job(list[at], at)
      } catch {
        out[at] = undefined
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, worker))
  return out
}
