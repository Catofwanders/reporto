import type { Pr } from './types';

/**
 * The two bits of wording that were being redefined per module.
 *
 * `plural` existed three times — twice byte-identical, once with a `many` override added
 * after "3 replys" shipped. One copy means the fix lands everywhere.
 */
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n === 1 ? word : many}`;

/**
 * A ticket's PR, named the way every view names it: the repo's last segment and the number.
 * The org prefix is noise on a page where every repo shares it.
 */
/**
 * The mark before a PR reference: merged, closed, still open.
 *
 * Three states shared two glyphs, with colour carrying the difference — and colour alone is
 * the thing this codebase keeps deciding not to rely on. It got worse once an open PR gained a
 * review chip beside it, because a closed PR then read as "open, and nobody has looked".
 */
export const prMark = (state: 'open' | 'merged' | 'closed'): string =>
  state === 'merged' ? '✓' : state === 'closed' ? '✕' : '◌';

export const prLabel = (pr: Pick<Pr, 'repo' | 'num'>) => `${pr.repo.split('/').pop()}#${pr.num}`;
