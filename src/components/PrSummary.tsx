import { useState } from 'react';
import Button from '@mui/material/Button';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { PrsReport } from '../types';
import { awaitingOthers, prState } from '../prState';
import { copyText } from '../copyText';

interface PrSummaryProps {
  report: PrsReport;
}

export const PrSummary = ({ report }: PrSummaryProps) => {
  const [copied, setCopied] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[] | null>(null);

  const all = report.repos.flatMap((group) => group.prs);
  const waiting = all.filter(awaitingOthers);
  const inState = (state: ReturnType<typeof prState>) =>
    all.filter((p) => prState(p) === state).length;
  const counts = [
    { label: 'awaiting review', value: inState('awaiting-review'), tone: 'open' },
    { label: 'awaiting re-review', value: inState('awaiting-re-review'), tone: 'warn' },
    { label: 'commented', value: inState('commented'), tone: 'bad' },
    { label: 'approved', value: inState('approved'), tone: 'ok' },
    { label: 'changes requested', value: inState('changes-requested'), tone: 'bad' },
    { label: 'drafts', value: all.filter((p) => p.draft).length, tone: 'na' },
  ];

  const copy = async () => {
    const links = waiting.map((pr) => pr.url);
    setFailed(null);
    if (await copyText(links.join('\n'))) {
      setCopied(links.length);
      setTimeout(() => setCopied(null), 4000);
      return;
    }
    // Every copy path refused; show the links so they can be selected by hand rather
    // than losing the action entirely.
    setFailed(links);
  };

  return (
    <div className="pr-summary">
      <ul className="pr-counts">
        {counts.map((c) => (
          <li key={c.label}>
            <span className={`pr-count pr-count-${c.tone}`}>{c.value}</span>
            <span className="pr-count-label">{c.label}</span>
          </li>
        ))}
      </ul>

      <Button
        size="small"
        startIcon={<ContentCopyIcon fontSize="small" />}
        onClick={() => void copy()}
        disabled={waiting.length === 0}
        sx={{
          textTransform: 'none',
          color: 'var(--accent)',
          borderColor: 'var(--line)',
        }}
        variant="outlined"
      >
        {copied === null
          ? `Copy ${waiting.length} link${waiting.length === 1 ? '' : 's'} awaiting review`
          : `Copied ${copied}`}
      </Button>

      {failed && (
        <details className="pr-copy-fallback" open>
          <summary>Clipboard refused — select these instead</summary>
          <textarea readOnly rows={Math.min(failed.length, 8)} value={failed.join('\n')} />
        </details>
      )}
    </div>
  );
};
