import { Link } from 'react-router-dom';
import type { EmailReport } from '../types';
import type { EmailSummary } from '../summary';
import { Donut } from './Donut';

interface MailWidgetProps {
  report: EmailReport;
  summary: EmailSummary;
}

export const MailWidget = ({ report, summary }: MailWidgetProps) => (
  <aside className="widget">
    <div className="widget-head">
      <h3>📬 Mail</h3>
      <span className="widget-more">
        <Link to="/email">{report.date} →</Link>
      </span>
    </div>
    <Donut
      size={112}
      centerValue={summary.needAction}
      centerLabel="need action"
      slices={[
        { label: 'Need action', value: summary.needAction, cssColor: 'var(--bad-ink)' },
        { label: 'Done', value: summary.done, cssColor: 'var(--ok-ink)' },
        {
          label: 'No action',
          value: summary.items - summary.done - summary.needAction,
          cssColor: 'var(--na-ink)',
        },
      ]}
    />
    <p className="widget-event-meta">
      {summary.perSection.map((s) => `${s.title.split('—')[0].trim()} ${s.count}`).join(' · ')}
    </p>
  </aside>
);
