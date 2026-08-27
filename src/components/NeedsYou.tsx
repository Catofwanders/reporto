import { Link } from 'react-router-dom';
import type { SvgIconComponent } from '@mui/icons-material';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { ACTION_LABEL, type FeedAction, type FeedItem, type FeedSource } from '../needsYou';

interface NeedsYouProps {
  items: FeedItem[];
  /** How many the feed drew from, so a cut list can say what it left out. */
  total: number;
}

const ICON: Record<FeedSource, SvgIconComponent> = {
  pr: AltRouteRoundedIcon,
  review: VisibilityRoundedIcon,
  slack: ForumRoundedIcon,
  ticket: ConfirmationNumberRoundedIcon,
};

/** Said in the row, so the icon is confirmation rather than the only clue. */
const SOURCE_LABEL: Record<FeedSource, string> = {
  pr: 'PR',
  review: 'review',
  slack: 'Slack',
  ticket: 'ticket',
};

/** Most blocking first — the same order the weights encode. */
const ORDER: FeedAction[] = ['push', 'review', 'answer', 'merge', 'unstick'];

/**
 * One list, grouped by what to do.
 *
 * The first attempt at this was name + age and nothing else, with the reason hidden in a
 * tooltip. It was unreadable: seven rows saying what each thing *is* and nothing about why it
 * was in front of you, and four icons too quiet to carry the difference between a review and
 * a Slack message.
 *
 * So each row now carries a three-word reason and names its source in words, and the rows sit
 * under a one-word verb — Your move, Review, Answer, Merge, Unstick. The verb is what makes a
 * merged list legible: it says what the group wants before any row is read. The full sentence
 * is still the tooltip, and the page behind each row has all of it.
 */
export const NeedsYou = ({ items, total }: NeedsYouProps) => {
  const groups = ORDER.map((action) => ({
    action,
    rows: items.filter((item) => item.action === action),
  })).filter((group) => group.rows.length > 0);

  return (
    <section className="panel needs-you">
      <div className="mini-head">
        <span className="panel-icon badge-warn" aria-hidden="true">
          <BoltRoundedIcon fontSize="small" />
        </span>
        <h2>Needs you</h2>
        <span className="needs-count">{total}</span>
      </div>

      {groups.length === 0 ? (
        <p className="mini-empty">Nothing is waiting on you.</p>
      ) : (
        <div className="needs-scroll">
          {groups.map((group) => (
            <div key={group.action} className="needs-group">
              <p className="needs-verb">
                {ACTION_LABEL[group.action]}
                <span className="needs-verb-count">{group.rows.length}</span>
              </p>
              <ul className="needs-list">
                {group.rows.map((item) => {
                  const Icon = ICON[item.source];
                  return (
                    <li key={item.id} className={`needs-row is-${item.tone}`}>
                      <Link to={item.to} title={item.detail}>
                        <Icon className={`needs-icon is-${item.source}`} fontSize="small" />
                        <span className="needs-body">
                          <span className="needs-label">{item.label}</span>
                          <span className="needs-why">
                            <span className="needs-source">{SOURCE_LABEL[item.source]}</span>
                            {item.why}
                          </span>
                        </span>
                        <span className={`needs-age chip-${item.tone}`}>
                          {item.days === 0 ? 'today' : `${item.days}d`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {total > items.length && (
        <p className="needs-more">{total - items.length} more waiting</p>
      )}
    </section>
  );
};
