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

/** Posts a reply as the token's owner. The caller must have checked the destination. */
export function postSlackReply(options: {
  token: string | undefined;
  channel: string;
  threadTs?: string | null;
  text: string;
}): Promise<{ channel: string; ts: string }>;

/** Adds one reaction to a message — a one-word answer. */
export function addSlackReaction(options: {
  token: string | undefined;
  channel: string;
  ts: string;
  name?: string;
}): Promise<{ channel: string; ts: string; name: string }>;
