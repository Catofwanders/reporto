import { describe, expect, it } from 'vitest'
import { pooled } from './pool.mjs'

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('pooled', () => {
  /*
   * Order is the whole contract: callers zip the results back onto the input list by index —
   * `needAging.forEach((ticket, at) => { ticket.statusSince = since[at] })` — so a result that
   * arrives out of order would put one ticket's age on another ticket's card.
   */
  it('returns results in input order, not completion order', async () => {
    const out = await pooled([30, 1, 20, 2], 4, async (ms) => {
      await tick(ms)
      return ms
    })
    expect(out).toEqual([30, 1, 20, 2])
  })

  it('never runs more than the limit at once', async () => {
    let live = 0
    let peak = 0
    await pooled(Array.from({ length: 12 }, (_, n) => n), 4, async () => {
      live += 1
      peak = Math.max(peak, live)
      await tick(5)
      live -= 1
    })
    expect(peak).toBe(4)
  })

  /*
   * One unreadable changelog must cost that ticket's age pill and nothing else — the whole
   * board went blank when a single 429 rejected the batch.
   */
  it('isolates a failing item as undefined instead of failing the batch', async () => {
    const out = await pooled([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('429')
      return n * 10
    })
    expect(out).toEqual([10, undefined, 30])
  })

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await pooled([], 4, async () => 1)).toEqual([])
    expect(await pooled([1], 99, async (n) => n)).toEqual([1])
  })

  it('passes the index to the job, for callers that need it', async () => {
    expect(await pooled(['a', 'b'], 1, async (item, at) => `${at}:${item}`)).toEqual(['0:a', '1:b'])
  })
})
