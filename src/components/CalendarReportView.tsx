import type { CalendarEvent, CalendarReport } from '../types';
import { Chip } from './Chip';
import { ReportAccordion } from './ReportAccordion';
import { RefreshButton } from './RefreshButton';

interface CalendarReportViewProps {
  report: CalendarReport;
}

const kindTone = (kind: CalendarEvent['kind']) => {
  if (kind === 'kickoff') return 'bad';
  if (kind === 'meeting') return 'warn';
  return 'na';
};

const whenLabel = (event: CalendarEvent) => {
  if (event.kind === 'all-day') return 'all day';
  if (!event.start) return 'TBD';
  return new Date(event.start).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const EventRow = ({ event }: { event: CalendarEvent }) => (
  <article className="item">
    <span className="chip-when">
      <Chip tone={kindTone(event.kind)}>{whenLabel(event)}</Chip>
    </span>
    <div className="item-body">
      <div className="item-top">
        <span className="from">
          {event.url ? (
            <a href={event.url} target="_blank" rel="noopener noreferrer">
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </span>
        <Chip tone="na">{event.kind}</Chip>
        <span className="time">{event.calendar}</span>
      </div>
      {event.note && <p className="note">{event.note}</p>}
    </div>
  </article>
);

export const CalendarReportView = ({ report }: CalendarReportViewProps) => (
  <section className="panel">
    <div className="panel-head">
      <h2>📅 Calendar</h2>
      <span className="panel-meta">
        {report.date}
        <RefreshButton kind="calendar" />
      </span>
    </div>

    <p className="banner banner-ok">{report.summary}</p>

    <ReportAccordion title="Today" count={report.events.length}>
      <div className="list">
        {report.events.length === 0 && <div className="empty">No events today.</div>}
        {report.events.map((e) => (
          <EventRow key={e.title} event={e} />
        ))}
      </div>
    </ReportAccordion>

    <ReportAccordion title="Upcoming / watch" count={report.upcoming.length}>
      <div className="list">
        {report.upcoming.length === 0 && <div className="empty">Nothing upcoming.</div>}
        {report.upcoming.map((e) => (
          <EventRow key={e.title} event={e} />
        ))}
      </div>
    </ReportAccordion>
  </section>
);
