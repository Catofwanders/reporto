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
export const prLabel = (pr: Pick<Pr, 'repo' | 'num'>) => `${pr.repo.split('/').pop()}#${pr.num}`;
