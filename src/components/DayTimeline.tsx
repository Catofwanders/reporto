import { Link } from 'react-router-dom';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import type { CalendarEvent, CalendarReport } from '../types';

interface DayTimelineProps {
  report: CalendarReport;
}

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

const minutesOfDay = (iso: string | null): number | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', HHMM);

/** "in 2h 10m", or "now" for something already started. Distance, not a timestamp. */
const untilLabel = (start: string): string => {
  const minutes = Math.round((new Date(start).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
};

/** Whole hours inside the window, at most five, so the labels never collide. */
const hourTicks = (from: number, to: number): number[] => {
  const first = Math.ceil(from / 60);
  const last = Math.floor(to / 60);
  const step = Math.max(1, Math.ceil((last - first) / 4));
  const ticks: number[] = [];
  for (let hour = first; hour <= last; hour += step) ticks.push(hour * 60);
  return ticks;
};

/** The window the timeline covers: the working day, stretched to fit anything outside it. */
const bounds = (events: CalendarEvent[]) => {
  const times = events
    .map((event) => minutesOfDay(event.start))
    .filter((m): m is number => m !== null);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const from = Math.min(8 * 60, now, ...times);
  const to = Math.max(18 * 60, now + 60, ...times.map((m) => m + 60));
  return { from, to };
};

/**
 * Today as a line, with each event written on it.
 *
 * Two earlier passes got this wrong the same way: the label sat well below the line, so the
 * eye had to travel from a dot down to a caption and back to work out when anything was. Now
 * the time and the title are one pill anchored at the event's own position — the mark *is* the
 * label — and only the hour scale sits underneath.
 *
 * Pills alternate above and below the line rather than stacking, which keeps two nearby
 * meetings legible without a collision pass. The row of weekday initials that used to close
 * this card is gone: it carried no times and no titles, so it said nothing worth the space.
 */
export const DayTimeline = ({ report }: DayTimelineProps) => {
  const timed = report.events.filter((event) => event.start && event.kind !== 'all-day');
  const allDay = report.events.filter((event) => !event.start || event.kind === 'all-day');
  const { from, to } = bounds(timed);
  const span = Math.max(1, to - from);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const at = (minutes: number) => `${((minutes - from) / span) * 100}%`;
  const next = timed.find((event) => (minutesOfDay(event.start) ?? 0) >= now) ?? null;

  return (
    <section className="panel day-panel">
      <div className="mini-head">
        <span className="panel-icon badge-qcout" aria-hidden="true">
          <EventRoundedIcon fontSize="small" />
        </span>
        <h2>Today</h2>
        <Link className="day-more" to="/calendar">
          {report.date}
        </Link>
      </div>

      {timed.length === 0 ? (
        <p className="mini-empty">No meetings today.</p>
      ) : (
        <div
          className="day-track"
          role="img"
          aria-label={`Today: ${timed
            .map((event) => `${clock(event.start!)} ${event.title}`)
            .join('; ')}`}
        >
          <div className="day-line" />
          {now >= from && now <= to && (
            <div className="day-now" style={{ left: at(now) }} title="now" />
          )}

          {timed.map((event, index) => {
            const minutes = minutesOfDay(event.start) ?? from;
            const past = minutes < now;
            return (
              <a
                key={`${event.start}-${event.title}`}
                className={`day-pill${past ? ' is-past' : ''}${
                  index % 2 ? ' is-below' : ''
                } kind-${event.kind}`}
                style={{ left: at(minutes) }}
                href={event.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                title={`${clock(event.start!)} · ${event.title}${event.note ? ` — ${event.note}` : ''}`}
              >
                <span className="day-pill-time">{clock(event.start!)}</span>
                <span className="day-pill-title">{event.title}</span>
              </a>
            );
          })}

          {hourTicks(from, to).map((minutes) => (
            <span key={minutes} className="day-tick" style={{ left: at(minutes) }}>
              {minutes / 60}
            </span>
          ))}
        </div>
      )}

      <p className="day-next">
        {next ? (
          <>
            <span className="day-next-when">{untilLabel(next.start!)}</span>
            <span className="day-next-title" title={next.title}>
              {next.title}
            </span>
          </>
        ) : (
          <span className="day-next-when is-clear">nothing else today</span>
        )}
        {report.upcoming.length > 0 && (
          <Link className="day-next-ahead" to="/calendar">
            {report.upcoming.length} ahead
          </Link>
        )}
      </p>

      {allDay.length > 0 && (
        <ul className="day-chips">
          {allDay.map((event) => (
            <li key={event.title} className="chip chip-na" title={event.note ?? undefined}>
              {event.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
