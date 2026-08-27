import type {
  CalendarReport,
  JiraReport,
  PrsReport,
  ReviewsReport,
  SlackReport,
} from '../types';
import { useCapabilities } from '../capabilitiesContext';
import { CalendarWidget } from '../components/CalendarWidget';
import { FlowChecks } from '../components/FlowChecks';
import { HomePrs } from '../components/HomePrs';
import { HomeReviews } from '../components/HomeReviews';
import { HomeSlack } from '../components/HomeSlack';
import { HomeTickets } from '../components/HomeTickets';
import { StandupCard } from '../components/StandupCard';

interface HomePageProps {
  jira: JiraReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

/**
 * The morning's answer to "what needs me", as modules rather than pages.
 *
 * Each module carries the few rows worth acting on and links to the page that holds the
 * rest, so the dashboard is one screen instead of the Jira panel and the PR lanes repeated
 * in full. The month's statistics used to close it out; they were context you scrolled past
 * rather than acted on, and the review queue — where somebody else is waiting — earns that
 * space better.
 */
export const HomePage = ({ jira, calendar, prs, reviews, slack }: HomePageProps) => {
  // A module whose credentials are missing, or which has been switched off in Settings, is
  // not shown at all: an empty card that can never fill reads as a broken card.
  const { usable } = useCapabilities();

  return (
    <main className="home">
      {/* Contradictions first: they are the only thing here that is silently wrong. */}
      <FlowChecks jira={jira} prs={prs} slack={usable('slack') ? slack : null} />

      <div className="home-modules">
        {jira && usable('jira') && <HomeTickets report={jira} />}
        {prs && usable('prs') && <HomePrs report={prs} />}
        {reviews && usable('reviews') && <HomeReviews report={reviews} jira={jira} />}
        {slack && usable('slack') && <HomeSlack report={slack} />}
        {calendar && usable('calendar') && <CalendarWidget report={calendar} />}
      </div>

      <StandupCard jira={jira} prs={prs} calendar={calendar} />
    </main>
  );
};
