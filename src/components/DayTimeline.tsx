import { Link } from 'react-router-dom';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import type { CalendarEvent, CalendarReport } from '../types';

interface DayTimelineProps {
  report: CalendarReport;
}

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' };

const minutesOfDay = (iso: string | null): number | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
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
  const times = events.map((event) => minutesOfDay(event.start)).filter((m): m is number => m !== null);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const from = Math.min(8 * 60, now, ...times);
  const to = Math.max(18 * 60, now + 60, ...times.map((m) => m + 60));
  return { from, to };
};

/**
 * Today as a line rather than a list.
 *
 * A list of times makes the reader do the arithmetic: three hours until the next thing, or
 * twenty minutes. A timeline with a marker for now answers that by position — which is the
 * whole reason a dashboard draws instead of writing.
 *
 * All-day entries have no position on it, so they sit underneath as chips; the week ahead is
 * weekday initials rather than another list of rows.
 */
export const DayTimeline = ({ report }: DayTimelineProps) => {
  const timed = report.events.filter((event) => event.start && event.kind !== 'all-day');
  const allDay = report.events.filter((event) => !event.start || event.kind === 'all-day');
  const { from, to } = bounds(timed);
  const span = Math.max(1, to - from);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const at = (minutes: number) => `${((minutes - from) / span) * 100}%`;

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
        <div className="day-track" role="img" aria-label={`Today: ${timed
          .map((event) => `${new Date(event.start!).toLocaleTimeString('en-GB', HHMM)} ${event.title}`)
          .join('; ')}`}
        >
          <div className="day-line" />
          {/* Hour marks, or the line is just a line: an event at 15:30 says nothing about how
              far off it is without a scale to read it against. */}
          {hourTicks(from, to).map((minutes) => (
            <span key={minutes} className="day-tick" style={{ left: at(minutes) }}>
              {minutes / 60}
            </span>
          ))}
          {now >= from && now <= to && (
            <div className="day-now" style={{ left: at(now) }} title="now">
              <span className="day-now-dot" />
            </div>
          )}
          {timed.map((event) => {
            const minutes = minutesOfDay(event.start) ?? from;
            const past = minutes < now;
            return (
              <a
                key={`${event.start}-${event.title}`}
                className={`day-event${past ? ' is-past' : ''} kind-${event.kind}`}
                style={{ left: at(minutes) }}
                href={event.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                title={`${new Date(event.start!).toLocaleTimeString('en-GB', HHMM)} · ${event.title}${
                  event.note ? ` — ${event.note}` : ''
                }`}
              >
                <span className="day-dot" />
                <span className="day-time">
                  {new Date(event.start!).toLocaleTimeString('en-GB', HHMM)}
                </span>
                <span className="day-title">{event.title}</span>
              </a>
            );
          })}
        </div>
      )}

      {allDay.length > 0 && (
        <ul className="day-chips">
          {allDay.map((event) => (
            <li key={event.title} className="chip chip-na" title={event.note ?? undefined}>
              {event.title}
            </li>
          ))}
        </ul>
      )}

      {report.upcoming.length > 0 && (
        <ul className="day-week">
          {report.upcoming.slice(0, 5).map((event) => (
            <li
              key={`${event.start}-${event.title}`}
              className={`chip chip-${event.kind === 'kickoff' ? 'bad' : 'na'}`}
              title={`${event.title}${event.note ? ` — ${event.note}` : ''}`}
            >
              {event.start
                ? new Date(event.start).toLocaleDateString('en-GB', WEEKDAY)
                : 'soon'}
            </li>
          ))}
          <li className="day-week-note">ahead</li>
        </ul>
      )}
    </section>
  );
};
