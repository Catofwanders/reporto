import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { ReportKind } from '../reportKinds';
import { KIND_META } from '../reportKinds';
import { useRefresh } from '../refreshContext';

interface RefreshButtonProps {
  kind: ReportKind;
  size?: 'small' | 'medium';
}

export const RefreshButton = ({ kind, size = 'small' }: RefreshButtonProps) => {
  const { running, errors, commandOf, run } = useRefresh();
  const meta = KIND_META[kind];
  const busy = running.has(kind);
  const error = errors[kind];
  const command = commandOf[kind];

  const title = busy
    ? `Running ${command ?? 'update'}…`
    : error
      ? `Failed: ${error}`
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
          ) : (
            <RefreshIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};
