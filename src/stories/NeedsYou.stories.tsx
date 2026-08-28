import type { Meta, StoryObj } from '@storybook/react-vite';
import { NeedsYou } from '../components/NeedsYou';
import { needsYou, needsYouTotal } from '../needsYou';
import type { JiraReport } from '../types';
import { freshPrs, freshReviews, freshSlack, jiraReport } from './fixtures';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * The board with times-in-status, which the fixtures leave off — a pull only reads changelogs
 * for the statuses configured as worth aging. Without one of these the Unstick group cannot
 * appear at all, since an unmeasured ticket is not a slow ticket.
 */
const aged: JiraReport = {
  ...jiraReport,
  groups: jiraReport.groups.map((group) => ({
    ...group,
    tickets: group.tickets.map((ticket, i) => ({
      ...ticket,
      statusSince: daysAgo(i === 0 ? 9 : 1),
    })),
  })),
};

const AGING = { 'In Progress': 4, 'Ready for QA': 6, default: 5 };
const STUCK = ['In Progress', 'Ready for QA'];

/** Built through the real derivation, so a change to a lane rule shows up in the story. */
const feed = (over: Partial<Parameters<typeof needsYou>[0]> = {}) => {
  const args = {
    prs: freshPrs(),
    reviews: freshReviews(),
    slack: freshSlack(),
    jira: aged,
    aging: AGING,
    stuckStatuses: STUCK,
    ...over,
  };
  return { items: needsYou(args), total: needsYouTotal(args) };
};

const meta = {
  title: 'Panels/NeedsYou',
  component: NeedsYou,
  // `onReadTicket` is what puts the "read it here" control on a ticket row; the dashboard
  // passes the shared drawer's opener, and a story only needs to prove the control appears.
  args: { ...feed(), onReadTicket: () => {} },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof NeedsYou>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every verb group at once. Needs a raised limit to show them: Unstick carries the lowest
 * weight of anything in the feed, so at the dashboard's own limit of seven it is the first
 * group to fall off — which is the ordering working, not a bug.
 */
export const AllGroups: Story = { args: feed({ limit: 20 }) };

/**
 * Cut to three rows with more behind them. The count in the head is the whole queue, not the
 * part shown, and the line underneath says what was left out.
 */
export const Trimmed: Story = { args: feed({ limit: 3 }) };

/** One source only — what the panel looks like with Slack and Jira switched off. */
export const GithubOnly: Story = { args: feed({ slack: null, jira: null }) };

/** Nothing blocked on me. Said in one line rather than as five empty groups. */
export const Clear: Story = { args: { items: [], total: 0 } };
