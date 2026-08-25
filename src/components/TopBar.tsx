import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import type { ReportKind } from '../reportKinds';
import { KIND_META, REPORT_KINDS } from '../reportKinds';
import { useRefresh } from '../refreshContext';

interface TopBarProps {
  title: string;
  subtitle: string;
  /** The report this page is about; its update button acts on that report alone. */
  kind?: ReportKind;
  /** `all` updates every refreshable report, `none` offers no button. */
  action?: 'all' | 'none';
}

/**
 * Page heading on the left, one action on the right — and the action belongs to the page:
 * pressing update on the Jira page pulls Jira, not everything. Only the dashboard, which
 * shows every report at once, updates them all.
 *
 * There is deliberately no search box: the app holds four reports and a search that found
 * nothing would be set dressing.
 */
export const TopBar = ({ title, subtitle, kind, action }: TopBarProps) => {
  const { running, errors, apiKinds, canRefresh, run, runAll } = useRefresh();

  const heading = (
    <div className="shell-top-heading">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );

  if (action === 'none') return <header className="shell-top">{heading}</header>;

  if (kind) {
    // A report this app cannot regenerate gets no button rather than one that always fails.
    if (!canRefresh(kind)) return <header className="shell-top">{heading}</header>;

    const meta = KIND_META[kind];
    const busy = running.has(kind);
    const error = errors[kind];
    const viaApi = apiKinds.has(kind);

    return (
      <header className="shell-top">
        {heading}
        <Tooltip
          title={
            busy
              ? `Updating ${meta.label}…`
              : error
                ? `Last attempt failed: ${error}`
                : viaApi
                  ? `Update ${meta.label} — fetched straight from the API`
                  : `Update ${meta.label}`
          }
          disableInteractive
        >
          <span>
            <button
              type="button"
              className={`shell-top-action${error ? ' has-error' : ''}`}
              onClick={() => void run(kind)}
              disabled={busy}
              aria-label={`update ${meta.label}`}
            >
              {busy ? (
                <CircularProgress size={13} sx={{ color: 'inherit' }} />
              ) : viaApi ? (
                <BoltRoundedIcon fontSize="small" />
              ) : (
                <RefreshRoundedIcon fontSize="small" />
              )}
              Update {meta.label}
            </button>
          </span>
        </Tooltip>
      </header>
    );
  }

  const refreshable = REPORT_KINDS.filter(canRefresh);
  const busy = refreshable.filter((k) => running.has(k));
  if (refreshable.length < 2) return <header className="shell-top">{heading}</header>;

  return (
    <header className="shell-top">
      {heading}
      <Tooltip
        title={
          busy.length
            ? `Updating ${busy.map((k) => KIND_META[k].label).join(', ')}…`
            : `Update ${refreshable.map((k) => KIND_META[k].label).join(', ')} — all at once`
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
    </header>
  );
};
