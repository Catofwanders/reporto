import { useState } from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ReplyRoundedIcon from '@mui/icons-material/ReplyRounded';
import type { SlackRow } from '../types';
import { sendSlackReaction, sendSlackReply } from '../slackActions';

interface SlackReplyProps {
  row: SlackRow;
  /** Called after something was actually sent, so the row can leave the lane. */
  onSent: () => void;
}

/**
 * Answering from the queue.
 *
 * A user token posts as the human, in a shared workspace, with no undo — so this asks twice
 * in the only way that matters: the composer states the destination in words ("as you, in
 * #orders-team"), and the send button is the second click after opening it. Nothing is ever
 * sent without a person pressing it, and no text is ever composed for them.
 *
 * The tick is the same action in one word, for the messages that need acknowledging rather
 * than answering — which, going by the queue, is most of them.
 */
export const SlackReply = ({ row, onSent }: SlackReplyProps) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'reply' | 'react' | null>(null);

  const where = row.kind === 'dm' ? `@${row.channel}` : `#${row.channel}`;
  const destination = row.threadTs ? `in the thread in ${where}` : `in ${where}`;

  const run = async (what: 'reply' | 'react') => {
    setBusy(true);
    setError(null);
    try {
      if (what === 'reply') await sendSlackReply(row.id, text);
      else await sendSlackReaction(row.id);
      setSent(what);
      setText('');
      setOpen(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <span className="slack-sent" title={`sent ${destination}`}>
        {sent === 'reply' ? 'replied' : 'acknowledged'}
      </span>
    );
  }

  if (!open) {
    return (
      <div className="slack-actions">
        <Button
          size="small"
          startIcon={<ReplyRoundedIcon fontSize="small" />}
          onClick={() => setOpen(true)}
          sx={{ textTransform: 'none', color: 'var(--accent)' }}
        >
          Reply
        </Button>
        <Button
          size="small"
          disabled={busy}
          onClick={() => void run('react')}
          title={`React ✅ ${destination} — posts as you`}
          sx={{ textTransform: 'none', color: 'var(--ink-2)', minWidth: 0 }}
        >
          {busy ? <CircularProgress size={13} /> : '✅'}
        </Button>
        {error && <span className="secret-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="slack-composer">
      <p className="slack-composer-to">
        Sends <strong>as you</strong>, {destination}
      </p>
      <textarea
        value={text}
        rows={3}
        autoFocus
        placeholder="Your reply…"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          // Enter alone inserts a newline: a message this public should not be one keystroke
          // from sending. ⌘Enter is the deliberate version.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && text.trim()) {
            void run('reply');
          }
        }}
      />
      <div className="slack-composer-row">
        <Button
          size="small"
          variant="outlined"
          disabled={!text.trim() || busy}
          onClick={() => void run('reply')}
          sx={{ textTransform: 'none', color: 'var(--accent)', borderColor: 'var(--line)' }}
        >
          {busy ? <CircularProgress size={14} /> : 'Send'}
        </Button>
        <Button
          size="small"
          onClick={() => setOpen(false)}
          sx={{ textTransform: 'none', color: 'var(--ink-2)' }}
        >
          Cancel
        </Button>
        <span className="module-hint">⌘↵ sends</span>
      </div>
      {error && <p className="secret-error">{error}</p>}
    </div>
  );
};
