import { describe, expect, it } from 'vitest';
import type { JiraActivityItem } from './types';
import {
  isUnread,
  markAllRead,
  markRead,
  mentionCount,
  NO_MARKS,
  readMarks,
  unreadItems,
} from './jiraActivity';

const item = (over: Partial<JiraActivityItem> & Pick<JiraActivityItem, 'id' | 'at'>): JiraActivityItem => ({
  ticket: 'SHOP-14',
  ticketUrl: 'https://jira.example.com/browse/SHOP-14',
  summary: 'basket totals ignore the seller discount',
  status: 'Ready for QA',
  author: 'a teammate',
  avatar: null,
  mentionsMe: false,
  excerpt: 'this needs the payout contract first',
  ...over,
});

describe('isUnread', () => {
  it('treats everything as unread before anything has been marked', () => {
    expect(isUnread(item({ id: 'SHOP-14:1', at: '2026-08-30T09:00:00.000Z' }), NO_MARKS)).toBe(true);
  });

  it('reads a dismissed id as read whatever the timestamps say', () => {
    const marks = { seenAt: null, dismissed: ['SHOP-14:1'] };
    expect(isUnread(item({ id: 'SHOP-14:1', at: '2026-08-30T09:00:00.000Z' }), marks)).toBe(false);
    expect(isUnread(item({ id: 'SHOP-14:2', at: '2026-08-30T09:00:00.000Z' }), marks)).toBe(true);
  });

  it('draws the line at seenAt, inclusive', () => {
    const marks = { seenAt: '2026-08-30T09:00:00.000Z', dismissed: [] };
    expect(isUnread(item({ id: 'a', at: '2026-08-30T09:00:00.000Z' }), marks)).toBe(false);
    expect(isUnread(item({ id: 'b', at: '2026-08-30T08:59:59.000Z' }), marks)).toBe(false);
    expect(isUnread(item({ id: 'c', at: '2026-08-30T09:00:01.000Z' }), marks)).toBe(true);
  });

  /*
   * A comment whose timestamp will not parse is news, not history. The alternative silently
   * hides it forever, which is the one outcome an unread queue must never produce.
   */
  it('keeps an unparseable timestamp unread', () => {
    const marks = { seenAt: '2026-08-30T09:00:00.000Z', dismissed: [] };
    expect(isUnread(item({ id: 'a', at: 'not a date' }), marks)).toBe(true);
  });
});

describe('unreadItems and mentionCount', () => {
  const items = [
    item({ id: 'a', at: '2026-08-30T10:00:00.000Z', mentionsMe: true }),
    item({ id: 'b', at: '2026-08-29T10:00:00.000Z', mentionsMe: true }),
    item({ id: 'c', at: '2026-08-31T10:00:00.000Z' }),
  ];

  it('counts only the unread mentions, not every mention in the window', () => {
    const marks = { seenAt: '2026-08-29T23:00:00.000Z', dismissed: [] };
    expect(unreadItems(items, marks).map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(mentionCount(items, marks)).toBe(1);
  });
});

describe('markAllRead', () => {
  /*
   * The mark is the newest item's own timestamp, never "now". A comment written an hour ago
   * that this pull has not fetched yet would otherwise arrive already read.
   */
  it('marks up to the newest item on screen, not up to the present', () => {
    const items = [
      item({ id: 'a', at: '2026-08-30T10:00:00.000Z' }),
      item({ id: 'b', at: '2026-08-28T10:00:00.000Z' }),
    ];
    expect(markAllRead(items, NO_MARKS).seenAt).toBe('2026-08-30T10:00:00.000Z');
    const later = item({ id: 'c', at: '2026-08-31T10:00:00.000Z' });
    expect(isUnread(later, markAllRead(items, NO_MARKS))).toBe(true);
  });

  it('never moves the mark backwards, so a stale report cannot un-read anything', () => {
    const marks = { seenAt: '2026-08-31T10:00:00.000Z', dismissed: ['x'] };
    const stale = [item({ id: 'a', at: '2026-08-20T10:00:00.000Z' })];
    expect(markAllRead(stale, marks)).toEqual(marks);
  });

  it('leaves the mark alone when there is nothing datable to mark', () => {
    expect(markAllRead([], NO_MARKS)).toEqual(NO_MARKS);
    expect(markAllRead([item({ id: 'a', at: 'not a date' })], NO_MARKS)).toEqual(NO_MARKS);
  });
});

describe('markRead', () => {
  it('adds the id once and keeps seenAt where it was', () => {
    const marks = { seenAt: '2026-08-30T09:00:00.000Z', dismissed: ['a'] };
    const next = markRead('a', markRead('b', marks));
    expect(next.dismissed).toEqual(['b', 'a']);
    expect(next.seenAt).toBe('2026-08-30T09:00:00.000Z');
  });

  it('keeps the dismissed list bounded', () => {
    let marks = NO_MARKS;
    for (let n = 0; n < 260; n += 1) marks = markRead(`id-${n}`, marks);
    expect(marks.dismissed).toHaveLength(200);
    expect(marks.dismissed[199]).toBe('id-259');
  });
});

describe('readMarks', () => {
  /*
   * The node test environment has no localStorage at all, which is the same shape of failure
   * as a private window or a blocked storage partition: the queue must load, all unread.
   */
  it('falls back to no marks when storage is unavailable', () => {
    expect(readMarks()).toEqual(NO_MARKS);
  });
});
