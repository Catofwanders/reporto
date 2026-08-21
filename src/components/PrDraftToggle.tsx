import { useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import type { OpenPr } from '../types';
import { runPrAction } from '../prActions';

interface PrDraftToggleProps {
  repo: string;
  pr: OpenPr;
  /** Called after the flip lands, so the row stops showing the old state. */
  onChanged: () => void;
}

/**
 * Draft ⇄ ready, in one click.
 *
 * The label names the outcome rather than the current state — "Ready for review", not
 * "toggle draft" — so it reads the same as the button on GitHub and needs no learning. The
 * row already shows a `draft` chip when it is one, so repeating the state here would be
 * noise; what is missing is the verb.
 */
export const PrDraftToggle = ({ repo, pr, onChanged }: PrDraftToggleProps) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flip = async () => {
    setBusy(true);
    setError(null);
    try {
      await runPrAction(repo, pr.num, pr.draft ? 'ready' : 'draft');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const label = pr.draft ? 'Ready for review' : 'Convert to draft';

  return (
    <Tooltip title={error ?? `${label} — ${repo}#${pr.num}`} disableInteractive>
      <button
        type="button"
        className={`chip chip-${error ? 'bad' : pr.draft ? 'open' : 'na'} chip-button pr-draft-toggle`}
        onClick={() => void flip()}
        disabled={busy}
        aria-label={`${label}, ${repo}#${pr.num}`}
      >
        {busy ? <CircularProgress size={9} sx={{ color: 'inherit' }} /> : label}
      </button>
    </Tooltip>
  );
};
