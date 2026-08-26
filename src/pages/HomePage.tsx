import type { CalendarReport, JiraReport, PrsReport, ReviewsReport } from '../types';
import { CalendarWidget } from '../components/CalendarWidget';
import { FlowChecks } from '../components/FlowChecks';
import { HomePrs } from '../components/HomePrs';
import { HomeReviews } from '../components/HomeReviews';
import { HomeTickets } from '../components/HomeTickets';
import { StandupCard } from '../components/StandupCard';

interface HomePageProps {
  jira: JiraReport | null;
  reviews: ReviewsReport | null;
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
export const HomePage = ({ jira, calendar, prs, reviews }: HomePageProps) => (
  <main className="home">
    {/* Contradictions first: they are the only thing here that is silently wrong. */}
    <FlowChecks jira={jira} prs={prs} />

    <div className="home-modules">
      {jira && <HomeTickets report={jira} />}
      {prs && <HomePrs report={prs} />}
      {reviews && <HomeReviews report={reviews} jira={jira} />}
      {calendar && <CalendarWidget report={calendar} />}
    </div>

    <StandupCard jira={jira} prs={prs} calendar={calendar} />
  </main>
);
