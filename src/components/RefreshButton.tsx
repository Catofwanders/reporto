import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import BoltIcon from '@mui/icons-material/Bolt';
import type { ReportKind } from '../reportKinds';
import { KIND_META } from '../reportKinds';
import { useRefresh } from '../refreshContext';

interface RefreshButtonProps {
  kind: ReportKind;
  size?: 'small' | 'medium';
}

export const RefreshButton = ({ kind, size = 'small' }: RefreshButtonProps) => {
  const { running, errors, commandOf, apiKinds, canRefresh, run } = useRefresh();

  // Nothing to offer for reports this app cannot regenerate — a button that always fails
  // is worse than no button.
  if (!canRefresh(kind)) return null;

  const meta = KIND_META[kind];
  const busy = running.has(kind);
  const error = errors[kind];
  const command = commandOf[kind];
  const viaApi = apiKinds.has(kind);

  const title = busy
    ? `${viaApi ? 'Fetching' : 'Running'} ${viaApi ? meta.label : (command ?? 'update')}…`
    : error
      ? `Failed: ${error}`
      : viaApi
        ? `Update ${meta.label} — fetched straight from the API`
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
            color: error ? 'var(--bad-ink)' : 'var(--ink-2)',
            '&:hover': { color: 'var(--accent)' },
          }}
        >
          {busy ? (
            <CircularProgress size={16} sx={{ color: 'var(--accent)' }} />
          ) : viaApi ? (
            <BoltIcon fontSize="small" />
          ) : (
            <RefreshIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};
