import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import type { SlackReport } from '../types';
import { agingTone } from '../prLanes';
import {
  SLACK_LANES,
  type SlackLaneId,
  type SlackLaneRow,
  toSlackLanes,
} from '../slackLanes';
import { CopyPrLinks } from '../components/CopyPrLinks';
import { RefreshButton } from '../components/RefreshButton';

interface SlackPageProps {
  report: SlackReport | null;
}

const Rows = ({
  rows,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: SlackLaneRow[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], next: boolean) => void;
}) => {
  const ids = rows.map((entry) => entry.row.id);
  const picked = ids.filter((id) => selected.has(id)).length;
  const all = picked === ids.length && ids.length > 0;

  return (
    <div className="review-table-wrap">
      <table className="review-table">
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
  const [hideBots, setHideBots] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const lanes = useMemo<Map<SlackLaneId, SlackLaneRow[]>>(
    () => (report ? toSlackLanes(report) : new Map()),
    [report],
  );

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

  const shown = SLACK_LANES.filter((lane) => !(lane.id === 'bots' && hideBots)).flatMap(
    (lane) => lanes.get(lane.id) ?? [],
  );
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

        {SLACK_LANES.map((lane) => {
          if (lane.id === 'bots' && hideBots) return null;
          const rows = lanes.get(lane.id) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={lane.id} className={`pr-lane pr-lane-${lane.id}`}>
              <header className="pr-lane-head">
                <h3>{lane.title}</h3>
                <span className="count">{rows.length}</span>
                <p className="pr-lane-hint">{lane.hint}</p>
              </header>
              <Rows
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
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
