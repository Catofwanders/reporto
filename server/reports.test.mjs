import { describe, expect, it } from 'vitest'
import { prunePlan } from './reports.mjs'

const day = (offset) => {
  const at = new Date('2026-08-31T12:00:00+02:00')
  at.setDate(at.getDate() + offset)
  return at.toLocaleDateString('en-CA')
}

const index = {
  latest: { jira: `jira-${day(0)}.json`, stats: `stats-${day(-45)}.json` },
  history: [
    { date: day(0), jira: `jira-${day(0)}.json` },
    { date: day(-10), jira: `jira-${day(-10)}.json`, prs: `prs-${day(-10)}.json` },
    { date: day(-40), jira: `jira-${day(-40)}.json` },
    { date: day(-45), stats: `stats-${day(-45)}.json` },
  ],
}

const NOW = new Date('2026-08-31T12:00:00+02:00')

describe('prunePlan', () => {
  it('keeps everything inside the window', () => {
    const { keep } = prunePlan(index, 30, NOW)
    expect(keep.has(`jira-${day(0)}.json`)).toBe(true)
    expect(keep.has(`jira-${day(-10)}.json`)).toBe(true)
    expect(keep.has(`prs-${day(-10)}.json`)).toBe(true)
  })

  it('drops reports past the window, and the history entries naming them', () => {
    const { keep, history } = prunePlan(index, 30, NOW)
    expect(keep.has(`jira-${day(-40)}.json`)).toBe(false)
    expect(history.map((entry) => entry.date)).toEqual([day(0), day(-10)])
  })

  /*
   * The statistics pull runs once a day at most and is often weeks old; its newest report is
   * the only thing that route can draw. Deleting it for being old would blank the page.
   */
  it('keeps whatever index.latest points at, however old it is', () => {
    const { keep } = prunePlan(index, 30, NOW)
    expect(keep.has(`stats-${day(-45)}.json`)).toBe(true)
  })

  it('keeps nothing when the index knows nothing, so the caller can refuse to delete', () => {
    expect(prunePlan({}, 30, NOW).keep.size).toBe(0)
    expect(prunePlan({ latest: {}, history: [] }, 30, NOW).keep.size).toBe(0)
  })

  it('ignores a history entry with no date rather than throwing', () => {
    const { history } = prunePlan(
      { latest: {}, history: [{ jira: 'jira-x.json' }, { date: day(0), jira: 'jira-y.json' }] },
      30,
      NOW,
    )
    expect(history.map((entry) => entry.date)).toEqual([day(0)])
  })
})
