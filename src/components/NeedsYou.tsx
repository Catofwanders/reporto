import { Link } from 'react-router-dom';
import type { SvgIconComponent } from '@mui/icons-material';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import type { FeedItem, FeedSource } from '../needsYou';

interface NeedsYouProps {
  items: FeedItem[];
  /** How many the feed drew from, so a cut list can say what it left out. */
  total: number;
}

/** The source is carried by an icon rather than by a heading, which is what merges the lists. */
const ICON: Record<FeedSource, SvgIconComponent> = {
  pr: AltRouteRoundedIcon,
  review: VisibilityRoundedIcon,
  slack: ForumRoundedIcon,
  ticket: ConfirmationNumberRoundedIcon,
};

const WHERE: Record<FeedSource, string> = {
  pr: 'your pull request',
  review: 'a review',
  slack: 'a message',
  ticket: 'a ticket',
};

/**
 * One list, ordered by what to do first.
 *
 * Every row is icon, name, age — three glances rather than a sentence. The reason lives in the
 * title attribute, because it answers a question you only ask after deciding to look, and the
 * page behind each row carries it in full.
 *
 * The row links inside the app rather than out to GitHub or Slack: landing on the queue with
 * the item highlighted keeps its neighbours visible, and the external link is one more click
 * from there.
 */
export const NeedsYou = ({ items, total }: NeedsYouProps) => (
  <section className="panel needs-you">
    <div className="mini-head">
      <span className="panel-icon badge-warn" aria-hidden="true">
        <BoltRoundedIcon fontSize="small" />
      </span>
      <h2>Needs you</h2>
      <span className="needs-count">{total}</span>
    </div>

    {items.length === 0 ? (
      <p className="mini-empty">Nothing is waiting on you.</p>
    ) : (
      <ul className="needs-list">
        {items.map((item) => {
          const Icon = ICON[item.source];
          return (
            <li key={item.id} className={`needs-row is-${item.tone}`}>
              <Link to={item.to} title={`${WHERE[item.source]} — ${item.detail}`}>
                <Icon className="needs-icon" fontSize="small" />
                <span className="needs-label">{item.label}</span>
                <span className={`needs-age chip-${item.tone}`}>
                  {item.days === 0 ? 'today' : `${item.days}d`}
                </span>
              </Link>
            </li>
          );
        })}
        {total > items.length && (
          <li className="needs-more">{total - items.length} more waiting</li>
        )}
      </ul>
    )}
  </section>
);
