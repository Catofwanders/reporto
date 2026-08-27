import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import type { CalendarReport, JiraReport, PrsReport, StandupSince } from '../types';
import { fetchStandupSince } from '../standup';
import { buildStandup, standupText } from '../standupNote';
import { copyText } from '../copyText';
import { postStandup, standupChannel } from '../slackActions';
import { useCapabilities } from '../capabilitiesContext';

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
  const { usable, statusAging, stuckStatuses } = useCapabilities();
  const [since, setSince] = useState<StandupSince | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Where posting would land. Asked for once; null means the button has nothing to offer. */
  const [channel, setChannel] = useState<string | null>(null);
  /** Posting is two clicks: the first only reveals where it would go. */
  const [confirming, setConfirming] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!usable('slack')) return;
    let cancelled = false;
    void standupChannel().then((name) => {
      if (!cancelled) setChannel(name);
    });
    return () => {
      cancelled = true;
    };
  }, [usable]);

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

  const note = since
    ? buildStandup(since, jira, prs, calendar, statusAging, stuckStatuses)
    : null;

  /**
   * Posts the note as me, into the channel config names. Two clicks by design: the first
   * says where it is going, because a stand-up in the wrong channel is not something an
   * undo fixes, and this is the one button here that speaks to other people.
   */
  const post = async () => {
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      await postStandup(standupText(note));
      setPosted(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
          {note && channel && !posted && (
            <Button
              size="small"
              startIcon={<SendRoundedIcon fontSize="small" />}
              disabled={busy}
              onClick={() => (confirming ? void post() : setConfirming(true))}
              title={`Posts as you into ${channel}`}
              sx={{ textTransform: 'none', color: confirming ? 'var(--bad-ink)' : 'var(--ink-2)' }}
            >
              {busy ? (
                <CircularProgress size={13} />
              ) : confirming ? (
                `Post to ${channel} as you?`
              ) : (
                'Post to Slack'
              )}
            </Button>
          )}
          {confirming && !busy && (
            <Button
              size="small"
              onClick={() => setConfirming(false)}
              sx={{ textTransform: 'none', color: 'var(--ink-2)' }}
            >
              Cancel
            </Button>
          )}
          {posted && <span className="slack-sent">posted to {channel}</span>}
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
