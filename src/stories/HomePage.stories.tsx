import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from 'react-router-dom';
import { ActionBar } from '../components/ActionBar';
import { HomePage } from '../pages/HomePage';
import { calendarReport, emailReport, jiraReport, prsReport } from './fixtures';

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

/**
 * Fixture dates are fixed so stories stay deterministic, which makes every PR read as
 * months idle. For the dashboard shot specifically, restamp them so the rows say "today".
 */
const freshPrs = {
  ...prsReport,
  repos: prsReport.repos.map((group) => ({
    ...group,
    prs: group.prs.map((pr, i) => ({ ...pr, updatedAt: minutesAgo(45 + i * 90) })),
  })),
};

const meta = {
  title: 'Pages/Home',
  component: HomePage,
  args: {
    email: emailReport,
    jira: jiraReport,
    calendar: calendarReport,
    prs: freshPrs,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    // Mirrors the shell in App.tsx, so the story is the whole dashboard rather than the
    // panels floating on their own. The preview decorator supplies .wrap and the router.
    (Story) => (
      <>
        <header className="app-head">
          <h1>
            <Link to="/" className="home-link">
              reporto
            </Link>
          </h1>
          <span className="app-sub">email + jira + calendar dashboard</span>
          <ActionBar
            generatedAt={{
              email: minutesAgo(14),
              calendar: minutesAgo(14),
              jira: minutesAgo(3),
              prs: minutesAgo(1),
            }}
          />
        </header>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole dashboard on invented data — safe to screenshot and share. */
export const Default: Story = {};

/** A fresh checkout, before any report has been written. */
export const NoReports: Story = {
  args: { email: null, jira: null, calendar: null, prs: null },
};
