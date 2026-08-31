import type { SlackRow } from './types';

/**
 * Does this row actually want an answer?
 *
 * "The last word is theirs" was the report's whole test, and it over-reports badly: measured
 * against a real fortnight, three rows sat in "waiting on you" and exactly one of them was a
 * question. The other two were statements — somebody said a thing and stopped — and a queue
 * that cannot tell those apart trains you to skim past all of them.
 *
 * So the last message is read, not just counted:
 *
 * - **ask** — a question mark, a request in words, or my handle in the *last* message rather
 *   than only in the one that started the thread. This is the queue.
 * - **closer** — "thanks", "ok", "will do", an emoji on its own. The conversation ended; there
 *   is nothing to answer, and rows like these are what the user noticed first.
 * - **statement** — everything else. It might deserve a look, it is not waiting on a reply,
 *   and it belongs in a lane you open rather than in the morning queue.
 *
 * Deliberately conservative in one direction: anything that looks like an ask is an ask. A
 * missed question costs a colleague a day; a statement that reaches the queue costs one line.
 */
export type SlackIntent = 'ask' | 'closer' | 'statement';

/** Extra words per workspace, from config — this vocabulary is not English-only in practice. */
export interface SlackWords {
  ask?: string[];
  closer?: string[];
}

/**
 * Phrases that ask for something without a question mark. Kept to the ones that are requests
 * in any register — "can you", "please" — rather than every verb that might imply one.
 */
const ASK_PHRASES = [
  'can you',
  'could you',
  'would you',
  'can we',
  'please',
  'pls',
  'need you',
  'need your',
  'any update',
  'any news',
  'let me know',
  'take a look',
  'have a look',
  'thoughts',
  'when will',
  'when can',
  'what about',
  'do you',
  'did you',
  'are you',
  'is it',
  'waiting on',
  'ping me',
  'confirm',
  'review this',
  'check this',
];

/**
 * Acknowledgements that end a conversation. Matched against the *whole* message, not searched
 * for inside it: "thanks, and can you also…" is an ask wearing a polite hat.
 */
const CLOSER_PHRASES = [
  'thanks',
  'thank you',
  'thanks!',
  'thx',
  'ty',
  'ok',
  'okay',
  'k',
  'got it',
  'understood',
  'noted',
  'sure',
  'np',
  'no problem',
  'great',
  'perfect',
  'nice',
  'cool',
  'done',
  'will do',
  'sounds good',
  'makes sense',
  'agreed',
  'fine',
  'yes',
  'no',
  'yep',
  'nope',
  'good',
];

/** Punctuation and emoji stripped, so "Thanks!! 🙏" is the same closer as "thanks". */
const bare = (text: string) =>
  text
    .toLowerCase()
    // Zero-width joiner first, on its own: inside the class it reads as a combining sequence,
    // which is both a lint warning and a fair description of what it would mean there.
    .replace(/\u200d/g, '')
    .replace(/[\p{Extended_Pictographic}\ufe0f]/gu, ' ')
    .replace(/[!.,;:)(]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Emoji, or nothing at all: as clear an end to a conversation as a word. */
const wordless = (text: string) => bare(text).length === 0 && text.trim().length > 0;

export function intentOf(row: SlackRow, words: SlackWords = {}): SlackIntent {
  /*
   * `lastText` is the last word when the state was read, and the mention's own text when it
   * was not — which is the honest fallback: an unanswered mention's last word *is* the
   * mention. `excerpt` covers a report written before the puller carried either.
   */
  const text = row.lastText ?? row.excerpt ?? '';
  const flat = bare(text);

  // My handle in the last message is the strongest ask signal there is, question mark or not.
  if (row.lastMentionsMe) return 'ask';
  if (text.includes('?')) return 'ask';

  const asks = [...ASK_PHRASES, ...(words.ask ?? []).map((word) => word.toLowerCase())];
  if (asks.some((phrase) => flat.includes(phrase))) return 'ask';

  if (wordless(text)) return 'closer';
  const closers = [...CLOSER_PHRASES, ...(words.closer ?? []).map((word) => word.toLowerCase())];
  /*
   * Whole-message match, and only for short messages: a five-word "ok" is an acknowledgement,
   * a forty-word paragraph that happens to start with "ok" is not.
   */
  if (flat.split(' ').length <= 4 && closers.includes(flat)) return 'closer';

  return 'statement';
}

/** Said in the row, so a filtered queue can explain itself rather than just being shorter. */
export const INTENT_LABEL: Record<SlackIntent, string> = {
  ask: 'asks you something',
  closer: 'nothing to answer',
  statement: 'told you something',
};

/** The same three, as a verb phrase — "<who> <this> 2 days ago in the channel". */
export const INTENT_SAID: Record<SlackIntent, string> = {
  ask: 'asked',
  closer: 'closed it off',
  statement: 'told you something',
};
