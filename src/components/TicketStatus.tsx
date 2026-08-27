import { useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import type { Ticket } from '../types';
import { formatStatus, statusTone } from '../jiraStatus';
import { applyTransition, fetchTransitions, type JiraTransition } from '../jiraActions';
import { useCapabilities } from '../capabilitiesContext';
import { Chip } from './Chip';

interface TicketStatusProps {
  ticket: Ticket;
  /**
   * Called after a transition lands, so the report can be refetched. Gets the status the
   * transition advertised as its target, which is all a caller has to go on until the pull
   * comes back — enough to drop a card that no longer belongs in a filtered list.
   */
  onChanged?: (nextStatus: string) => void;
}

/**
 * The status chip, which doubles as the way to change it. Transitions are fetched when the
 * menu opens rather than with the report: a workflow's options depend on the current status
 * and differ per project, so they cannot be derived here, and asking for thirty tickets up
 * front would be thirty round trips for a menu that usually stays shut.
 */
export const TicketStatus = ({ ticket, onChanged }: TicketStatusProps) => {
  const { statuses } = useCapabilities();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [transitions, setTransitions] = useState<JiraTransition[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = !onChanged;

  const open = async (event: React.MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget);
    setError(null);
    if (transitions) return;
    try {
      setTransitions(await fetchTransitions(ticket.key));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pick = async (transition: JiraTransition) => {
    setAnchor(null);
    setBusy(true);
    setError(null);
    try {
      await applyTransition(ticket.key, transition.id);
      // The new status comes from the next pull, not from guessing it here: a workflow can
      // land somewhere other than the transition's advertised target.
      setTransitions(null);
      onChanged?.(transition.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) {
    return <Chip tone={statusTone(ticket, statuses)}>{formatStatus(ticket.status)}</Chip>;
  }

  return (
    <>
      <Tooltip title={error ?? `Change status of ${ticket.key}`} disableInteractive>
        <button
          type="button"
          className={`chip chip-${error ? 'bad' : statusTone(ticket, statuses)} chip-button`}
          onClick={(e) => void open(e)}
          disabled={busy}
          aria-label={`change status of ${ticket.key}, currently ${ticket.status}`}
        >
          {busy ? (
            <CircularProgress size={9} sx={{ color: 'inherit' }} />
          ) : (
            <>
              {formatStatus(ticket.status)}
              {/* The caret is what says "this opens something" — without it the chip reads
                  as a label, and nobody clicks a label. */}
              <span className="chip-caret" aria-hidden="true">
                ▾
              </span>
            </>
          )}
        </button>
      </Tooltip>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {transitions === null && !error && <MenuItem disabled>Loading…</MenuItem>}
        {error && <MenuItem disabled>{error}</MenuItem>}
        {transitions?.length === 0 && <MenuItem disabled>No transitions available</MenuItem>}
        {transitions?.map((transition) => (
          <MenuItem key={transition.id} onClick={() => void pick(transition)}>
            {/* Jira names transitions inconsistently ("Start work" vs "In Progress"), so
                show the target status when it differs from the transition's own name. */}
            {transition.name === transition.to
              ? formatStatus(transition.name)
              : `${formatStatus(transition.name)} → ${formatStatus(transition.to)}`}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
