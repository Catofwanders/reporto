import { useState } from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import type { CalendarReport, JiraReport, PrsReport, StandupSince } from '../types';
import { fetchStandupSince } from '../standup';
import { buildStandup, standupText } from '../standupNote';
import { copyText } from '../copyText';

interface StandupCardProps {
  jira: JiraReport | null;
  prs: PrsReport | null;
  calendar: CalendarReport | null;
}

/**
 * The stand-up note, on demand.
 *
 * Not built on load: the "what moved" half costs a Jira search plus a changelog read per
 * ticket, which is not worth paying on every visit to the dashboard for something needed
 * once a day.
 */
export const StandupCard = ({ jira, prs, calendar }: StandupCardProps) => {
  const [since, setSince] = useState<StandupSince | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      setSince(await fetchStandupSince());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const note = since ? buildStandup(since, jira, prs, calendar) : null;

  const copy = async () => {
    if (!note) return;
    if (await copyText(standupText(note))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-warn" aria-hidden="true">
            <CampaignRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>Stand-up note</h2>
            <p className="panel-sub">
              {note
                ? `What moved since ${note.since}, what today holds, what is stuck`
                : 'Built from Jira transitions, merged PRs and today’s calendar'}
            </p>
          </div>
        </div>
        <span className="panel-meta">
          {note && (
            <Button
              size="small"
              startIcon={<ContentCopyIcon fontSize="small" />}
              onClick={() => void copy()}
              sx={{ textTransform: 'none', color: 'var(--accent)', borderColor: 'var(--line)' }}
              variant="outlined"
            >
              {copied ? 'Copied' : 'Copy note'}
            </Button>
          )}
          <Button
            size="small"
            onClick={() => void build()}
            disabled={busy}
            sx={{ textTransform: 'none', color: 'var(--ink-2)' }}
          >
            {busy ? <CircularProgress size={13} /> : note ? 'Rebuild' : 'Build note'}
          </Button>
        </span>
      </div>

      {error && <p className="status error">{error}</p>}

      {note && (
        <div className="standup">
          {[
            { title: `Since ${note.since}`, lines: note.yesterday },
            { title: 'Today', lines: note.today },
            { title: 'Blockers', lines: note.blockers },
          ].map((block) => (
            <div key={block.title} className="standup-block">
              <h3>{block.title}</h3>
              {block.lines.length === 0 ? (
                <p className="standup-empty">nothing</p>
              ) : (
                <ul>
                  {block.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {note.notes.length > 0 && (
            <ul className="stats-notes">
              {note.notes.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
