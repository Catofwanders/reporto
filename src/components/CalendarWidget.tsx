import { Link } from 'react-router-dom';
import type { CalendarEvent, CalendarReport } from '../types';
import { Chip } from './Chip';

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

const EventLine = ({ event }: { event: CalendarEvent }) => (
  <li className="widget-event">
    <span className="chip-when">
      <Chip tone={tone(event.kind)}>{whenLabel(event)}</Chip>
    </span>
    <div className="widget-event-body">
      {event.url ? (
        <a href={event.url} target="_blank" rel="noopener noreferrer">
          {event.title}
          {event.kind === 'kickoff' && <span className="kind-tag">kick-off</span>}
        </a>
      ) : (
        <span>{event.title}</span>
      )}
      {event.note && <span className="widget-event-meta">{event.note}</span>}
    </div>
  </li>
);

export const CalendarWidget = ({ report }: { report: CalendarReport }) => (
  <aside className="widget">
    <div className="widget-head">
      <h3>📅 Today</h3>
      <span className="widget-more">
        <Link to="/calendar">{report.date} →</Link>
      </span>
    </div>
    {report.events.length === 0 ? (
      <p className="widget-empty">No meetings or kickoffs today.</p>
    ) : (
      <ul className="widget-list">
        {report.events.map((e, i) => (
          <EventLine key={eventKey(e, i)} event={e} />
        ))}
      </ul>
    )}
    {report.upcoming.length > 0 && (
      <>
        <h4 className="widget-sub">Watch</h4>
        <ul className="widget-list">
          {report.upcoming.map((e, i) => (
            <EventLine key={eventKey(e, i)} event={e} />
          ))}
        </ul>
      </>
    )}
  </aside>
);
