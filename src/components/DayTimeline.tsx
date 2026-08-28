import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import type { CalendarEvent, CalendarReport } from '../types';

interface DayTimelineProps {
  report: CalendarReport;
}

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Height of one pill row, and the clear space two pills on the same row must keep. */
const ROW = 24;
const GAP = 8;

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
 * Which row each pill sits on, so two of them never print over each other.
 *
 * Alternating sides was not enough: it separates neighbours, but a 09:30 / 10:00 / 10:45 morning
 * puts the first and third pill on the same side a few pixels apart, and the labels overlap into
 * nonsense. This packs them instead — first row that has room, measured, in time order — which
 * needs the rendered widths, hence the measure-then-place effect rather than an estimate. Even
 * rows go above the line, odd rows below.
 */
const useRows = (
  track: React.RefObject<HTMLDivElement | null>,
  positions: number[],
): number[] => {
  const key = positions.join(',');
  const [rows, setRows] = useState<number[]>(() => positions.map((_, i) => i % 2));

  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const place = () => {
      const width = node.clientWidth;
      const pills = [...node.querySelectorAll<HTMLElement>('.day-pill')];
      const at = key ? key.split(',').map(Number) : [];
      if (!width || pills.length !== at.length) return;
      const ends: number[] = [];
      const next = at.map((percent, i) => {
        const pillWidth = pills[i].offsetWidth;
        const left = (percent / 100) * width - pillWidth / 2;
        let row = ends.findIndex((end) => left >= end + GAP);
        if (row === -1) row = ends.length;
        ends[row] = left + pillWidth;
        return row;
      });
      setRows((prev) =>
        prev.length === next.length && prev.every((value, i) => value === next[i]) ? prev : next,
      );
    };
    place();
    // The dashboard aside is 24rem on a wide window and full width when it stacks; what fits
    // on one row at one size collides at the other.
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [track, key]);

  return rows;
};

/**
 * Today as a line, with each event written on it.
 *
 * Two earlier passes got this wrong the same way: the label sat well below the line, so the
 * eye had to travel from a dot down to a caption and back to work out when anything was. Now
 * the time and the title are one pill anchored at the event's own position — the mark *is* the
 * label — and only the hour scale sits underneath.
 *
 * The row of weekday initials that used to close this card is gone: it carried no times and no
 * titles, so it said nothing worth the space.
 */
export const DayTimeline = ({ report }: DayTimelineProps) => {
  const timed = report.events.filter((event) => event.start && event.kind !== 'all-day');
  const allDay = report.events.filter((event) => !event.start || event.kind === 'all-day');
  const { from, to } = bounds(timed);
  const span = Math.max(1, to - from);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const at = (minutes: number) => `${((minutes - from) / span) * 100}%`;
  const next = timed.find((event) => (minutesOfDay(event.start) ?? 0) >= now) ?? null;

  const plot = useRef<HTMLDivElement>(null);
  const positions = useMemo(
    () =>
      timed.map(
        (event) => Math.round((((minutesOfDay(event.start) ?? from) - from) / span) * 1000) / 10,
      ),
    // Recomputed from the same numbers the pills are positioned by, so the packing measures
    // what is on screen.
    [timed, from, span],
  );
  const rows = useRows(plot, positions);
  const rowsAbove = Math.max(1, ...rows.filter((row) => row % 2 === 0).map((r) => r / 2 + 1));
  const rowsBelow = rows.some((row) => row % 2 === 1)
    ? Math.max(...rows.filter((row) => row % 2 === 1).map((r) => (r - 1) / 2 + 1))
    : 0;

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
        <div className="day-track">
          <div
            className="day-plot"
            ref={plot}
            role="list"
            aria-label={`Today, ${timed.length} meeting${timed.length === 1 ? '' : 's'}`}
            style={{ height: `${(rowsAbove + rowsBelow) * ROW + 10}px` }}
          >
            <div className="day-line" aria-hidden="true" />
            {now >= from && now <= to && (
              <div className="day-now" style={{ left: at(now) }} title="now" aria-hidden="true" />
            )}

            {timed.map((event, index) => {
              const minutes = minutesOfDay(event.start) ?? from;
              const past = minutes < now;
              const row = rows[index] ?? index % 2;
              return (
                <a
                  key={`${event.start}-${event.title}`}
                  role="listitem"
                  // Position is visual; the name has to carry the time, and "earlier today"
                  // is the only way a dimmed pill reads as past without colour.
                  aria-label={`${clock(event.start!)} ${event.title}${past ? ' (earlier today)' : ''}`}
                  className={`day-pill${past ? ' is-past' : ''}${
                    row % 2 ? ' is-below' : ''
                  } kind-${event.kind}`}
                  style={{
                    left: at(minutes),
                    ['--day-row' as string]: `${Math.floor(row / 2) * ROW}px`,
                  }}
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
          </div>

          {/*
            * The plot is decoration over real links: `role="img"` used to sit on the track with
            * a summary label, and that prunes descendants — so the event pills, which are
            * anchors, were unreachable to anything assistive. The line, the now-marker and the
            * hour scale are the only parts that carry no information of their own.
            */}
          <div className="day-scale" aria-hidden="true">
            {hourTicks(from, to).map((minutes) => (
              <span key={minutes} className="day-tick" style={{ left: at(minutes) }}>
                {minutes / 60}
              </span>
            ))}
          </div>
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
