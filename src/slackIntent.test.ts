import { describe, expect, it } from 'vitest';
import type { SlackRow } from './types';
import { intentOf } from './slackIntent';

const row = (over: Partial<SlackRow> = {}): SlackRow => ({
  kind: 'mention',
  id: 'C1:1',
  channel: 'orders-team',
  channelId: 'C1',
  permalink: 'https://example.slack.com/archives/C1/p1',
  from: 'a colleague',
  fromId: 'U2',
  bot: false,
  at: '2026-05-14T08:00:00Z',
  threadTs: null,
  replies: 0,
  lastFrom: 'a colleague',
  lastFromMe: false,
  lastAt: '2026-05-14T08:00:00Z',
  excerpt: 'the seller discount is wrong on the basket total',
  tickets: [],
  prs: [],
  ...over,
});

describe('intentOf', () => {
  /*
   * The measurement this exists for: of three rows sitting in "waiting on you" on a real
   * fortnight, one was a question and two were statements. The queue treated all three the
   * same, which is what teaches you to skim past it.
   */
  it('reads a question as an ask', () => {
    expect(intentOf(row({ lastText: 'can you look at the payout contract?' }))).toBe('ask');
    expect(intentOf(row({ lastText: 'any update on the basket fix' }))).toBe('ask');
    expect(intentOf(row({ lastText: 'please check the QA build' }))).toBe('ask');
  });

  /* Being tagged in the *last* message is the strongest ask signal Slack has. */
  it('reads a mention of me in the last word as an ask, question mark or not', () => {
    expect(intentOf(row({ lastText: '@someone this one is yours now', lastMentionsMe: true }))).toBe(
      'ask',
    );
  });

  it('reads an acknowledgement as a closer', () => {
    for (const text of ['thanks!', 'Thank you', 'ok', 'got it', 'will do', 'perfect 🙏', '👍']) {
      expect(intentOf(row({ lastText: text }))).toBe('closer');
    }
  });

  /* "thanks, and can you also…" is an ask wearing a polite hat. */
  it('does not let a polite opener hide a request', () => {
    expect(intentOf(row({ lastText: 'thanks! can you also redeploy QC?' }))).toBe('ask');
  });

  /* A long message that happens to start with "ok" is not an acknowledgement. */
  it('only treats a short whole message as a closer', () => {
    expect(
      intentOf(
        row({
          lastText:
            'ok so the seller discount applies twice when the basket has two sellers and the second one is a marketplace listing',
        }),
      ),
    ).toBe('statement');
  });

  it('calls everything else a statement', () => {
    expect(intentOf(row({ lastText: 'deployed the payout report to QC' }))).toBe('statement');
  });

  /* A report written before the puller carried the last word still has to classify. */
  it('falls back to the mention text when there is no last word', () => {
    expect(intentOf(row({ excerpt: 'can you take a look?' }))).toBe('ask');
  });

  it('takes extra words from config, for a workspace that is not English', () => {
    expect(intentOf(row({ lastText: 'готово' }))).toBe('statement');
    expect(intentOf(row({ lastText: 'готово' }), { closer: ['готово'] })).toBe('closer');
    expect(intentOf(row({ lastText: 'подивись будь ласка' }), { ask: ['подивись'] })).toBe('ask');
  });
});
