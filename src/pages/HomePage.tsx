import { useState } from 'react';
import type {
  CalendarReport,
  JiraReport,
  PrsReport,
  ReviewsReport,
  SlackReport,
} from '../types';
import { useCapabilities } from '../capabilitiesContext';
import { flowFindings } from '../flowChecks';
import { kpis, needsYou, needsYouTotal } from '../needsYou';
import { DayTimeline } from '../components/DayTimeline';
import { FlowChecks } from '../components/FlowChecks';
import { KpiStrip } from '../components/KpiStrip';
import { NeedsYou } from '../components/NeedsYou';
import { PrMix } from '../components/PrMix';
import { StandupCard } from '../components/StandupCard';
import { JiraActivity } from '../components/JiraActivity';
import { SinceYesterday } from '../components/SinceYesterday';
import type { SinceReport } from '../sinceYesterday';
import {
  isSnoozed as rowSnoozed,
  readSnoozes,
  snooze as snoozeRow,
  writeSnoozes,
} from '../snooze';
import { isDone, readDone } from '../slackDone';

interface HomePageProps {
  jira: JiraReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
  /** What moved since the last day there is a report for; costs no API call. */
  since?: SinceReport;

}

/**
 * One screen: six numbers, one queue, and the day.
 *
 * What was here before was five cards of the same shape — a title, a count line, then four
 * lines of prose each. Measured: 341 words over 1.25 screens, with "waiting for a first
 * review" appearing four times. Worse than the length was the structure, which left the reader
 * interleaving four parallel lists by hand to answer the only question a morning asks, which
 * is what to do first.
 *
 * So the four lists become one, ordered by how much each thing is blocking; the counts move
 * into a strip that is read in a second; and today becomes a timeline, because "how long until
 * the next thing" is a distance rather than a sentence. Nothing is lost — every item links to
 * the page that owns it. This screen decides where to look; it does not do the work.
 */
export const HomePage = ({ jira, calendar, prs, reviews, slack, since }: HomePageProps) => {
  const { usable, statusAging, stuckStatuses, statuses, slackWords } = useCapabilities();
  const [snoozes, setSnoozes] = useState(readSnoozes);
  // Slack rows dismissed by hand, read once on mount like the other local marks.
  const [slackDone] = useState(readDone);
  const [showSnoozed, setShowSnoozed] = useState(false);

  // A module switched off in Settings, or one whose credentials are missing, contributes
  // nothing — not an empty row, not a zero in the strip.
  const sources = {
    jira: usable('jira') ? jira : null,
    prs: usable('prs') ? prs : null,
    reviews: usable('reviews') ? reviews : null,
    slack: usable('slack') ? slack : null,
    aging: statusAging,
    stuckStatuses,
    vocab: statuses,
  };

  const findings = flowFindings(sources.jira, sources.prs, sources.slack, statuses);
  // Before the first pull there is nothing to be relieved about; the panels say so instead of
  // rendering a confident emptiness.
  const unpulled = !sources.jira && !sources.prs && !sources.reviews && !sources.slack;
  const queue = needsYou({
    ...sources,
    slackWords,
    slackDone: (id) => isDone(id, slackDone),
  });
  /*
   * Snoozed rows leave the list but not the counting: the KPI strip keeps the true total, and
   * the panel says how many it is holding back. A number that quietly shrinks when a row is
   * dismissed is the failure mode this whole dashboard exists to avoid.
   */
  const snoozedNow = queue.filter((item) => rowSnoozed(item.id, snoozes));
  const items = showSnoozed ? queue : queue.filter((item) => !rowSnoozed(item.id, snoozes));
  // Same arguments as the queue itself: a total that counted rows the queue filters out would
  // make the "N more waiting" line claim work that is not there.
  const total = needsYouTotal({
    ...sources,
    slackWords,
    slackDone: (id) => isDone(id, slackDone),
  });
  const counts = kpis({ ...sources, conflicts: findings.length });

  return (
    <main className="home">
      {/* `loaded` is what keeps a never-pulled report from reading as a clear morning. */}
      <KpiStrip
        counts={counts}
        usable={usable}
        loaded={(kind) => Boolean(sources[kind])}
      />

      <div className="home-split">
        {/*
          The queue and the unread activity share the column, because they answer the two
          halves of the same question: what is waiting on me, and what happened while I was
          not looking. The activity panel is the same one the Jira page carries — rows, the
          unread filter, mark-all-read — rather than a count, which is what a tile was.
        */}
        <div className="home-queue">
          <NeedsYou
          items={items}
          total={total}
          unpulled={unpulled}
          onSnooze={(id) => {
            const next = snoozeRow(id, snoozes);
            writeSnoozes(next);
            setSnoozes(next);
          }}
          snoozed={snoozedNow.length}
          showSnoozed={showSnoozed}
          onToggleSnoozed={() => setShowSnoozed((on: boolean) => !on)}
          isSnoozed={(id) => rowSnoozed(id, snoozes)}
          />

          {sources.jira && <JiraActivity report={sources.jira} prs={sources.prs} />}
        </div>

        <div className="home-aside">
          {usable('calendar') &&
            (calendar ? (
              <DayTimeline report={calendar} />
            ) : (
              <section className="panel day-panel">
                <div className="mini-head">
                  <h2>Today</h2>
                </div>
                <p className="mini-empty">Calendar not pulled yet.</p>
              </section>
            ))}
          {sources.prs && <PrMix report={sources.prs} />}
          {/* Folded: this answers a Monday question, not an every-morning one. */}
          {since && <SinceYesterday report={since} />}
          {/* Folded by default: a contradiction is worth knowing about, not worth a third of
              the screen every morning, and its count is already in the strip above. */}
          <FlowChecks jira={sources.jira} prs={sources.prs} slack={sources.slack} collapsed />
        </div>
      </div>

      <StandupCard jira={sources.jira} prs={sources.prs} calendar={calendar} />
    </main>
  );
};
