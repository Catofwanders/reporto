import type { SlackReport } from '../src/types';

/**
 * Mentions of the token's owner, with the last word in each conversation worked out.
 * `days` bounds the search window; `excludeChannels` drops noise feeds by name.
 */
export function pullSlack(options: {
  token: string | undefined;
  days?: number;
  excludeChannels?: string[];
}): Promise<SlackReport>;
