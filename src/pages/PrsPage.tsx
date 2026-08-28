import type { PrsReport } from '../types';
import { useRefresh } from '../refreshContext';
import { PrLanes } from '../components/PrLanes';

interface PrsPageProps {
  report: PrsReport | null;
}

/**
 * The open-PR list on its own, full width. The dashboard shows the same panel, but the
 * sidebar offers PRs as a place to go, and a nav row that leads nowhere is a bug.
 */
export const PrsPage = ({ report }: PrsPageProps) => {
  const { run } = useRefresh();
  return (
    <main className="grid">
      {report ? (
        <>
          {/* A page cap looks exactly like a short list, so the pull says when it hit one. */}
          {report.incomplete?.map((note) => (
            <p key={note} className="status error">
              Incomplete pull — {note}
            </p>
          ))}
          <PrLanes report={report} onChanged={() => void run('prs')} />
        </>
      ) : (
        <p className="status">No PR report yet — press the update button beside Pull requests.</p>
      )}
    </main>
  );
};
