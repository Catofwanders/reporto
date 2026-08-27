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

interface HomePageProps {
  jira: JiraReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
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
export const HomePage = ({ jira, calendar, prs, reviews, slack }: HomePageProps) => {
  const { usable, statusAging } = useCapabilities();

  // A module switched off in Settings, or one whose credentials are missing, contributes
  // nothing — not an empty row, not a zero in the strip.
  const sources = {
    jira: usable('jira') ? jira : null,
    prs: usable('prs') ? prs : null,
    reviews: usable('reviews') ? reviews : null,
    slack: usable('slack') ? slack : null,
    aging: statusAging,
  };

  const findings = flowFindings(sources.jira, sources.prs, sources.slack);
  const items = needsYou(sources);
  const total = needsYouTotal(sources);
  const counts = kpis({ ...sources, conflicts: findings.length });

  return (
    <main className="home">
      <KpiStrip counts={counts} usable={usable} />

      <div className="home-split">
        <NeedsYou items={items} total={total} />

        <div className="home-aside">
          {calendar && usable('calendar') && <DayTimeline report={calendar} />}
          {sources.prs && <PrMix report={sources.prs} />}
          {/* Folded by default: a contradiction is worth knowing about, not worth a third of
              the screen every morning, and its count is already in the strip above. */}
          <FlowChecks jira={sources.jira} prs={sources.prs} slack={sources.slack} collapsed />
        </div>
      </div>

      <StandupCard jira={sources.jira} prs={sources.prs} calendar={calendar} />
    </main>
  );
};
