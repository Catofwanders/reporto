import { Link } from 'react-router-dom';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import type { CalendarEvent, CalendarReport } from '../types';

interface DayTimelineProps {
  report: CalendarReport;
}

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' };

/** "in 2h 10m", or "now" for something already started. Distance, not a timestamp. */
const untilLabel = (start: string): string => {
  const minutes = Math.round((new Date(start).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
};

/**
 * The days ahead, grouped.
 *
 * The row of weekday initials this replaces was unreadable: five chips saying "Fri Mon Tue"
 * with no titles, no times and no sense of which day was busy. A day is worth a column — the
 * weekday, the count, and the first thing on it — which is what somebody actually wants from
 * a week strip.
 */
interface DayAhead {
  key: string;
  weekday: string;
  events: CalendarEvent[];
  kickoff: boolean;
}

const daysAhead = (events: CalendarEvent[], limit = 4): DayAhead[] => {
  const byDay = new Map<string, DayAhead>();
  for (const event of events) {
    if (!event.start) continue;
    const at = new Date(event.start);
    const key = at.toISOString().slice(0, 10);
    const day =
      byDay.get(key) ??
      ({ key, weekday: at.toLocaleDateString('en-GB', WEEKDAY), events: [], kickoff: false } as DayAhead);
    day.events.push(event);
    day.kickoff = day.kickoff || event.kind === 'kickoff';
    byDay.set(key, day);
  }
  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(0, limit);
};

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
  const next = timed.find((event) => (minutesOfDay(event.start) ?? 0) >= now) ?? null;
  const ahead = daysAhead(report.upcoming);

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

      {/* What is next, in the terms the question is asked in: how long from now. */}
      <p className="day-next">
        {next ? (
          <>
            <span className="day-next-when">{untilLabel(next.start!)}</span>
            <span className="day-next-time">
              {new Date(next.start!).toLocaleTimeString('en-GB', HHMM)}
            </span>
            <span className="day-next-title" title={next.title}>
              {next.title}
            </span>
          </>
        ) : (
          <span className="day-next-when is-clear">nothing else today</span>
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

      {ahead.length > 0 && (
        <div className="day-ahead">
          {ahead.map((day) => (
            <div
              key={day.key}
              className={`day-ahead-col${day.kickoff ? ' is-kickoff' : ''}`}
              title={day.events
                .map(
                  (event) =>
                    `${event.start ? new Date(event.start).toLocaleTimeString('en-GB', HHMM) : ''} ${event.title}`,
                )
                .join('\n')}
            >
              <span className="day-ahead-day">{day.weekday}</span>
              <span className="day-ahead-bars" aria-hidden="true">
                {day.events.slice(0, 4).map((event, index) => (
                  <span key={index} className={`day-ahead-bar kind-${event.kind}`} />
                ))}
              </span>
              <span className="day-ahead-first">
                {day.events[0]?.start
                  ? new Date(day.events[0].start).toLocaleTimeString('en-GB', HHMM)
                  : 'all day'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
