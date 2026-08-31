import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import type { SlackReport } from '../types';
import { agingTone } from '../prLanes';
import {
  QUIET_LANES,
  SLACK_LANES,
  type SlackLaneId,
  type SlackLaneRow,
  toSlackLanes,
} from '../slackLanes';
import { isDone, markDone, readDone, undoDone, writeDone } from '../slackDone';
import { useCapabilities } from '../capabilitiesContext';
import { CopyPrLinks } from '../components/CopyPrLinks';
import { RefreshButton } from '../components/RefreshButton';
import { SlackReply } from '../components/SlackReply';
import { useHashTarget } from '../useHashTarget';

interface SlackPageProps {
  report: SlackReport | null;
}

const Rows = ({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onAnswered,
  onDone,
  done,
}: {
  rows: SlackLaneRow[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], next: boolean) => void;
  onAnswered: (id: string) => void;
  /** "This needs nothing" — the judgement the classifier cannot make from the words. */
  onDone: (id: string, next: boolean) => void;
  done: (id: string) => boolean;
}) => {
  const ids = rows.map((entry) => entry.row.id);
  const picked = ids.filter((id) => selected.has(id)).length;
  const all = picked === ids.length && ids.length > 0;

  return (
    <div className="review-table-wrap" tabIndex={0} aria-label="Slack table, scrolls sideways">
      <table className="review-table slack-table">
        <thead>
          <tr>
            <th className="review-pick">
              <input
                type="checkbox"
                checked={all}
                ref={(el) => {
                  if (el) el.indeterminate = picked > 0 && !all;
                }}
                onChange={() => onToggleAll(ids, !all)}
                aria-label={all ? 'Clear this lane' : 'Select every message in this lane'}
              />
            </th>
            <th>Age</th>
            <th>Where</th>
            <th>What it says</th>
            <th className="review-col-ticket">From</th>
            <th className="review-col-actions" aria-label="reply" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, idleDays, reason }) => {
            const on = selected.has(row.id);
            return (
              <tr key={row.id} id={row.id} className={on ? 'is-selected' : ''}>
                <td className="review-pick">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(row.id)}
                    aria-label={`Select the message from ${row.from} in ${row.channel}`}
                  />
                </td>
                <td>
                  <span
                    className={`pr-age chip-${agingTone(idleDays)}`}
                    title={`last message ${new Date(row.lastAt ?? row.at).toLocaleString('en-GB')}`}
                  >
                    {idleDays === 0 ? 'today' : `${idleDays}d`}
                  </span>
                </td>
                <td className="review-cell-pr">
                  <a className="ref" href={row.permalink} target="_blank" rel="noopener noreferrer">
                    {row.kind === 'dm' ? `@${row.channel}` : `#${row.channel}`}
                  </a>
                  {row.kind === 'dm' && <span className="pr-row-repo">DM</span>}
                  {row.threadTs && <span className="pr-row-repo">thread</span>}
                </td>
                <td className="review-cell-what">
                  <a href={row.permalink} target="_blank" rel="noopener noreferrer" title={row.excerpt}>
                    {row.excerpt || '(no text — a file or an attachment)'}
                  </a>
                  <span className="pr-row-reason">{reason}</span>
                </td>
                <td className="review-cell-ticket">
                  <span className="review-author">@{row.from}</span>
                </td>
                <td className="pr-cell-actions">
                  <SlackReply row={row} onSent={() => onAnswered(row.id)} />
                  {/*
                    The escape hatch for a row whose words do not say what it needs. Without
                    it the only way to clear a row is to answer it in Slack, which is
                    answering a message to fix a dashboard.
                  */}
                  <button
                    type="button"
                    className="slack-done"
                    aria-pressed={done(row.id)}
                    title={done(row.id) ? 'Bring it back' : 'Nothing to answer here'}
                    onClick={() => onDone(row.id, !done(row.id))}
                  >
                    {done(row.id) ? '↩' : '✕'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Slack as a queue: who addressed me, and whether the last word is still theirs.
 *
 * The rows are selectable for the same reason the review queue's are — the useful next step
 * is usually "open these five and answer them", and copying their permalinks in one go beats
 * hunting each one down in the client.
 */
export const SlackPage = ({ report }: SlackPageProps) => {
  // The dashboard queue links here with `#<row id>`; the rows have carried ids all along and
  // nothing was acting on them, so following a Slack row landed at the top of the table.
  useHashTarget([report]);
  const [hideBots, setHideBots] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /**
   * Rows answered in this session. The report still says somebody is waiting until the next
   * pull, and a row that sits in "waiting on you" after you have just replied to it is the
   * same lie the unread badge tells.
   */
  const [answeredHere, setAnsweredHere] = useState<Set<string>>(new Set());
  /** Rows dismissed by hand, kept in the browser — Slack has no "handled" flag to write. */
  const [done, setDone] = useState(readDone);
  /**
   * Which quiet lanes are open. Folded by default: on a real fortnight nine of twelve rows
   * were already answered, and a page that opens on nine rows of history buries the three
   * that want something.
   */
  const [open, setOpen] = useState<ReadonlySet<SlackLaneId>>(new Set());
  const { slackWords } = useCapabilities();

  const answered = (id: string) =>
    setAnsweredHere((prev) => new Set(prev).add(id));

  const lanes = useMemo<Map<SlackLaneId, SlackLaneRow[]>>(() => {
    if (!report) return new Map();
    const seen = {
      ...report,
      rows: report.rows.map((row) => {
        // Answered in this session, or dismissed by hand: either way it is not waiting, and
        // the report will not know until the next pull.
        if (answeredHere.has(row.id)) return { ...row, lastFromMe: true, lastFrom: report.me };
        if (isDone(row.id, done)) return { ...row, lastText: 'ok', lastMentionsMe: false };
        return row;
      }),
    };
    return toSlackLanes(seen, slackWords);
  }, [report, answeredHere, done, slackWords]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  if (!report) {
    return (
      <main className="grid">
        <p className="status">
          No Slack report yet — press the update button beside Slack in the sidebar.
        </p>
      </main>
    );
  }

  const bots = (lanes.get('bots') ?? []).length;
  const people = report.rows.filter((row) => !row.bot).length;

  const shown = SLACK_LANES.filter(
    (lane) =>
      !(lane.id === 'bots' && hideBots) && (!QUIET_LANES.includes(lane.id) || open.has(lane.id)),
  ).flatMap((lane) => lanes.get(lane.id) ?? []);
  const picked = shown
    .filter((entry) => selected.has(entry.row.id))
    .map((entry) => entry.row.permalink)
    .filter(Boolean);

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-qc" aria-hidden="true">
              <ForumRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>Slack mentions</h2>
              <p className="panel-sub">
                {people} from people{bots > 0 && `, ${bots} from apps`} · last {report.days} days
                · as {report.me}
              </p>
            </div>
          </div>
          <span className="panel-meta">
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={hideBots}
                onChange={() => setHideBots(!hideBots)}
              />
              hide apps
            </label>
            {report.date}
            <RefreshButton kind="slack" />
          </span>
        </div>

        {picked.length > 0 && (
          <div className="review-selection">
            <span>{picked.length} selected</span>
            <CopyPrLinks
              links={picked}
              label={`Copy ${picked.length} link${picked.length === 1 ? '' : 's'}`}
            />
            <Button
              size="small"
              onClick={() => setSelected(new Set())}
              sx={{ textTransform: 'none', color: 'var(--ink-2)' }}
            >
              Clear
            </Button>
          </div>
        )}

        {report.rows.length === 0 && (
          <p className="status">Nothing has named you in the last {report.days} days.</p>
        )}

        {/* A cap the pull hit is not a quiet fortnight; the report says so and so does this. */}
        {report.incomplete?.map((note) => (
          <p key={note} className="banner banner-warn">
            {note}
          </p>
        ))}

        {SLACK_LANES.map((lane) => {
          if (lane.id === 'bots' && hideBots) return null;
          const rows = lanes.get(lane.id) ?? [];
          if (rows.length === 0) return null;
          const quiet = QUIET_LANES.includes(lane.id);
          const shownHere = !quiet || open.has(lane.id);
          return (
            <section key={lane.id} className={`pr-lane pr-lane-${lane.id}`}>
              <header className="pr-lane-head">
                <h3>{lane.title}</h3>
                <span className="count">{rows.length}</span>
                <p className="pr-lane-hint">{lane.hint}</p>
                {quiet && (
                  <button
                    type="button"
                    className="needs-snoozed-toggle"
                    aria-expanded={shownHere}
                    onClick={() =>
                      setOpen((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(lane.id)) next.add(lane.id);
                        return next;
                      })
                    }
                  >
                    {shownHere ? 'hide' : 'show'}
                  </button>
                )}
              </header>
              {shownHere && (
                <Rows
                  rows={rows}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                  onAnswered={answered}
                  done={(id) => isDone(id, done)}
                  onDone={(id, next) => {
                    const marks = next ? markDone(id, done) : undoDone(id, done);
                    writeDone(marks);
                    setDone(marks);
                  }}
                />
              )}
            </section>
          );
        })}
      </section>

      <p className="status">
        Mentions only — a channel you were never named in is not in here. Replies land in
        Slack; this page is for finding what to answer.
      </p>
    </main>
  );
};
