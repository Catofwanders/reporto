import EventRoundedIcon from '@mui/icons-material/EventRounded';
import type { CalendarEvent, CalendarReport } from '../types';
import { Chip } from './Chip';
import { MiniPanel } from './MiniPanel';

/** Days ahead are context, not today's work: three is enough to spot what is coming. */
const UPCOMING = 3;

const WEEKDAY_TIME: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

const whenLabel = (event: CalendarEvent) => {
  if (event.kind === 'all-day') return 'all day';
  if (!event.start) return 'TBD';
  return new Date(event.start).toLocaleString('en-GB', WEEKDAY_TIME);
};

const tone = (kind: CalendarEvent['kind']) => {
  if (kind === 'kickoff') return 'bad';
  if (kind === 'all-day') return 'na';
  return 'warn';
};

// Titles repeat within a day ("1:1", "Interview"), so a title alone is not a stable key.
const eventKey = (event: CalendarEvent, index: number) =>
  `${index}:${event.start ?? 'all-day'}:${event.title}`;

/** The kick-off flag rides on the meta line: inside the title it wrapped mid-word. */
const metaLine = (event: CalendarEvent) =>
  [event.kind === 'kickoff' ? 'kick-off' : '', event.note ?? ''].filter(Boolean).join(' · ');

const EventLine = ({ event }: { event: CalendarEvent }) => {
  const meta = metaLine(event);
  return (
    <li className="mini-row">
      <span className="chip-when">
        <Chip tone={tone(event.kind)}>{whenLabel(event)}</Chip>
      </span>
      <div className="mini-row-body">
        {event.url ? (
          <a href={event.url} target="_blank" rel="noopener noreferrer" title={event.title}>
            {event.title}
          </a>
        ) : (
          <span className="mini-row-title" title={event.title}>
            {event.title}
          </span>
        )}
        {meta && (
          <span className="mini-row-meta" title={meta}>
            {meta}
          </span>
        )}
      </div>
    </li>
  );
};

export const CalendarWidget = ({ report }: { report: CalendarReport }) => {
  const upcoming = report.upcoming.slice(0, UPCOMING);
  const hidden = report.upcoming.length - upcoming.length;

  return (
    <MiniPanel
      icon={EventRoundedIcon}
      badge="badge-qcout"
      title="Today"
      kind="calendar"
      to="/calendar"
      linkLabel={`Calendar · ${report.date}`}
      count={report.events.length + upcoming.length}
      empty="No meetings or kickoffs today."
    >
      {report.events.length === 0 ? (
        <p className="mini-empty">Nothing today.</p>
      ) : (
        <ul className="mini-rows">
          {report.events.map((event, i) => (
            <EventLine key={eventKey(event, i)} event={event} />
          ))}
        </ul>
      )}

      {upcoming.length > 0 && (
        <>
          <h4 className="mini-sub">Watch</h4>
          <ul className="mini-rows">
            {upcoming.map((event, i) => (
              <EventLine key={eventKey(event, i)} event={event} />
            ))}
          </ul>
          {hidden > 0 && <p className="mini-rest">{hidden} more this week</p>}
        </>
      )}
    </MiniPanel>
  );
};
