import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { KIND_META, REPORT_KINDS } from '../reportKinds';
import { useRefresh } from '../refreshContext';

interface TopBarProps {
  title: string;
  subtitle: string;
}

/**
 * Page heading on the left, the one global action on the right. There is deliberately no
 * search box: the app holds four reports and a search that found nothing would be set
 * dressing.
 */
export const TopBar = ({ title, subtitle }: TopBarProps) => {
  const { running, canRefresh, runAll } = useRefresh();
  const refreshable = REPORT_KINDS.filter(canRefresh);
  const busy = refreshable.filter((kind) => running.has(kind));

  return (
    <header className="shell-top">
      <div className="shell-top-heading">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

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
              className="shell-top-action"
              onClick={() => void runAll()}
              disabled={busy.length === refreshable.length}
              aria-label="update every report"
            >
              {busy.length ? (
                <>
                  <CircularProgress size={13} sx={{ color: 'inherit' }} />
                  {busy.length}/{refreshable.length}
                </>
              ) : (
                <>
                  <BoltRoundedIcon fontSize="small" />
                  Update all
                </>
              )}
            </button>
          </span>
        </Tooltip>
      )}
    </header>
  );
};
