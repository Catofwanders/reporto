import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';
import type { ReportKind } from '../reportKinds';
import { KIND_META } from '../reportKinds';
import { useRefresh } from '../refreshContext';

interface RefreshButtonProps {
  kind: ReportKind;
  size?: 'small' | 'medium';
}

export const RefreshButton = ({ kind, size = 'small' }: RefreshButtonProps) => {
  const { running, errors, commandOf, modeOf, handedOff, run } = useRefresh();
  const meta = KIND_META[kind];
  const busy = running.has(kind);
  const error = errors[kind];
  const command = commandOf[kind];
  const handoff = modeOf[kind] === 'handoff';
  const waiting = handedOff.has(kind);

  const title = busy
    ? `${handoff ? 'Opening a terminal for' : 'Running'} ${command ?? 'update'}…`
    : error
      ? `Failed: ${error}`
      : handoff
        ? waiting
          ? `${command} is open in a terminal — finish it there, then return to this tab`
          : `Update ${meta.label} — opens ${command} in a terminal (it needs your browser session)`
        : `Update ${meta.label}${command ? ` — runs ${command}` : ''}`;

  return (
    <Tooltip title={title} disableInteractive>
      <span className="refresh-slot">
        <IconButton
          size={size}
          onClick={() => void run(kind)}
          disabled={busy}
          aria-label={`update ${meta.label}`}
          sx={{
            color: error ? 'var(--bad-ink)' : waiting ? 'var(--warn-ink)' : 'var(--ink-2)',
            '&:hover': { color: 'var(--accent)' },
          }}
        >
          {busy ? (
            <CircularProgress size={16} sx={{ color: 'var(--accent)' }} />
          ) : handoff ? (
            <TerminalIcon fontSize="small" />
          ) : (
            <RefreshIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};
