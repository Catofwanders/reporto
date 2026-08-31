import { useState } from 'react';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import type { JiraActivityItem, JiraReport, PrsReport } from '../types';
import {
  ACTIVITY_WINDOW_DAYS,
  isUnread,
  markAllRead,
  markRead,
  mentionCount,
  readMarks,
  unreadItems,
  writeMarks,
} from '../jiraActivity';
import { plural } from '../format';
import { useRefresh } from '../refreshContext';
import { timeAgo } from '../timeAgo';
import { useTicketReader } from './useTicketReader';

interface JiraActivityProps {
  report: JiraReport;
  /** Passed to the drawer this opens, so a PR on the ticket can say its review state. */
  prs?: PrsReport | null;
  onChanged?: () => void;
}

type Filter = 'unread' | 'all';

const Row = ({
  item,
  unread,
  onRead,
  onDismiss,
}: {
  item: JiraActivityItem;
  unread: boolean;
  onRead: () => void;
  onDismiss: () => void;
}) => (
  <li className={`activity-row${unread ? ' is-unread' : ''}${item.mentionsMe ? ' is-mention' : ''}`}>
    <button
      type="button"
      className="activity-main"
      onClick={onRead}
      title={`${item.ticket} — ${item.summary}`}
    >
      <span className="activity-line">
        <span className="activity-key">{item.ticket}</span>
        <span className="activity-who">{item.author ?? 'someone'}</span>
        {item.mentionsMe && <span className="chip chip-warn">mentions you</span>}
        <span className="activity-age">{timeAgo(item.at)}</span>
      </span>
      {/* The excerpt, not the comment: enough to know whether it needs answering now. */}
      <span className="activity-excerpt">{item.excerpt || 'no text — an attachment or a table'}</span>
    </button>
    {unread && (
      <button
        type="button"
        className="activity-dismiss"
        onClick={onDismiss}
        aria-label={`Mark the comment on ${item.ticket} read`}
        title="Mark read"
      >
        ✓
      </button>
    )}
  </li>
);

/**
 * Comments on my tickets that I have not read.
 *
 * Jira's bell is not available to this app — the feed behind it answers 404 to API token auth —
 * so this is the same queue derived from comments, and the read mark is ours, in `localStorage`.
 * Which means the honest wording matters more than usual: an empty list says whether nothing
 * was fetched, nothing exists, or everything has been read, because all three look identical
 * and only one of them is good news.
 *
 * Opening a row opens the ticket drawer, which is where the comment can actually be read, and
 * marks that one read. The tick marks it read without opening it, for the ones the excerpt
 * already answered.
 */
export const JiraActivity = ({ report, prs = null, onChanged }: JiraActivityProps) => {
  const { running } = useRefresh();
  const { read, drawer } = useTicketReader({ report, prs, onChanged });
  const [marks, setMarks] = useState(readMarks);
  const [filter, setFilter] = useState<Filter>('unread');

  const save = (next: ReturnType<typeof readMarks>) => {
    writeMarks(next);
    setMarks(next);
  };

  const items = report.activity;
  const pendingActivity = report.pending?.includes('activity') ?? false;
  const unread = items ? unreadItems(items, marks) : [];
  const mentions = items ? mentionCount(items, marks) : 0;
  const rows = filter === 'unread' ? unread : (items ?? []);

  const openTicket = (item: JiraActivityItem) => {
    save(markRead(item.id, marks));
    read(item.ticket);
  };

  /*
   * Fetched, and there is genuinely nothing — which on a quiet board is most mornings. One
   * line rather than a full panel head: this sits above the board, and 140px of chrome saying
   * "nothing" pushes real work off the first screen. It stays visible rather than disappearing
   * so that "no comments" is still distinguishable from "not fetched".
   */
  if (items && items.length === 0) {
    return (
      <section className="panel activity is-quiet">
        <p className="status">
          <NotificationsRoundedIcon fontSize="small" aria-hidden="true" /> Nobody else has
          commented on your tickets in the last {ACTIVITY_WINDOW_DAYS} days.
          {report.activityNote && <span className="panel-pending"> · {report.activityNote}</span>}
        </p>
      </section>
    );
  }

  return (
    <section className="panel activity">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-warn" aria-hidden="true">
            <NotificationsRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>Unread activity</h2>
            <p className="panel-sub">
              {items
                ? `${unread.length} unread of ${plural(items.length, 'comment')} in the last ${ACTIVITY_WINDOW_DAYS} days`
                : 'Comments by other people on your tickets'}
              {mentions > 0 && (
                <span className="activity-mentions">
                  {' '}
                  · {mentions} tagged you
                </span>
              )}
              {report.activityNote && (
                <span className="panel-pending"> · {report.activityNote}</span>
              )}
            </p>
          </div>
        </div>
        <span className="panel-meta">
          <span className="segmented" role="group" aria-label="Activity filter">
            {(['unread', 'all'] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                className={filter === option ? 'is-active' : ''}
                onClick={() => setFilter(option)}
              >
                {option === 'unread' ? 'Unread' : 'All'}
              </button>
            ))}
          </span>
          {items && unread.length > 0 && (
            <button
              type="button"
              className="activity-clear"
              onClick={() => save(markAllRead(items, marks))}
            >
              Mark all read
            </button>
          )}
        </span>
      </div>

      {/* Three empty states, because "no rows" has three different causes. */}
      {!items && (
        <p className="status">
          {pendingActivity && running.has('jira')
            ? 'Comments loading…'
            : 'Comments not fetched — press the Jira update button.'}
        </p>
      )}
      {items && items.length > 0 && rows.length === 0 && (
        <p className="status">
          All read{marks.seenAt ? ` — marked ${timeAgo(marks.seenAt)}` : ''}. Switch to All to
          see them again.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="activity-list">
          {rows.map((item) => (
            <Row
              key={item.id}
              item={item}
              unread={isUnread(item, marks)}
              onRead={() => openTicket(item)}
              onDismiss={() => save(markRead(item.id, marks))}
            />
          ))}
        </ul>
      )}
      {drawer}
    </section>
  );
};
