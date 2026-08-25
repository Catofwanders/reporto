import type { ReportKind } from '../reportKinds';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { KIND_META, REPORT_KINDS } from '../reportKinds';
import { useRefresh } from '../refreshContext';
import { RefreshButton } from './RefreshButton';

interface ActionBarProps {
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
}

const fmtStamp = (iso: string | undefined) => {
  if (!iso) return 'never';
  const date = new Date(iso);
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const ActionBar = ({ generatedAt }: ActionBarProps) => {
  const { running, errors, canRefresh, runAll } = useRefresh();
  const refreshable = REPORT_KINDS.filter(canRefresh);
  const busy = refreshable.filter((kind) => running.has(kind));

  return (
    <div className="action-bar">
      {REPORT_KINDS.map((kind) => (
        <div
          key={kind}
          className={`action-item ${errors[kind] ? 'has-error' : ''} ${
            canRefresh(kind) ? '' : 'action-manual'
          }`}
          title={canRefresh(kind) ? undefined : `${KIND_META[kind].label} is written by running the skill in your own session`}
        >
          <span className="action-icon">{KIND_META[kind].icon}</span>
          <div className="action-labels">
            <span className="action-name">{KIND_META[kind].label}</span>
            <span className="action-stamp">
              {running.has(kind) ? 'updating…' : fmtStamp(generatedAt[kind])}
            </span>
          </div>
          <RefreshButton kind={kind} />
        </div>
      ))}

      {refreshable.length > 1 && (
        <Tooltip
          title={
            busy.length
              ? `Updating ${busy.map((kind) => KIND_META[kind].label).join(', ')}…`
              : `Update ${refreshable.map((kind) => KIND_META[kind].label).join(', ')} — all at once`
          }
          disableInteractive
        >
          <span>
            <button
              type="button"
              className="action-all"
              onClick={() => void runAll()}
              disabled={busy.length === refreshable.length}
              aria-label="update every report"
            >
              {busy.length ? (
                <>
                  <CircularProgress size={11} sx={{ color: 'inherit' }} />
                  {busy.length}/{refreshable.length}
                </>
              ) : (
                <>⚡ all</>
              )}
            </button>
          </span>
        </Tooltip>
      )}
    </div>
  );
};
