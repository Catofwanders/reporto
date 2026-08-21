import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { OpenPr } from '../types';
import type { PrActionName } from '../prActions';
import { runPrAction } from '../prActions';

interface PrRowActionsProps {
  repo: string;
  pr: OpenPr;
  /** Called after a state change lands, so the list can be refetched. */
  onChanged: () => void;
}

export const PrRowActions = ({ repo, pr, onChanged }: PrRowActionsProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (action: PrActionName) => {
    setAnchor(null);
    setBusy(true);
    setError(null);
    try {
      await runPrAction(repo, pr.num, action);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  };

  return (
    <>
      <IconButton
        size="small"
        disabled={busy}
        aria-label={`actions for ${repo}#${pr.num}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ color: error ? 'var(--bad-ink)' : 'var(--ink-2)', '&:hover': { color: 'var(--accent)' } }}
        title={error ?? undefined}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>

      {/* Draft ⇄ ready has its own button in the row now; the menu keeps what does not. */}
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setConfirmClose(true);
          }}
        >
          Close pull request…
        </MenuItem>
      </Menu>

      {/* Closing discards work in progress and is the one action here worth a stop. */}
      <Dialog open={confirmClose} onClose={() => setConfirmClose(false)}>
        <DialogTitle>Close {repo}#{pr.num}?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'var(--ink-2)' }}>
            {pr.title}
          </DialogContentText>
          <DialogContentText sx={{ color: 'var(--ink-2)', marginTop: '.6rem', fontSize: '.85rem' }}>
            This closes the pull request on GitHub without merging. It can be reopened, but
            any review state is lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={() => void apply('close')}
            sx={{ textTransform: 'none', color: 'var(--bad-ink)' }}
          >
            Close it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
