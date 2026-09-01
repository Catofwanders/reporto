import type { Meta, StoryObj } from '@storybook/react-vite';
import { NeedsYou } from '../components/NeedsYou';
import { needsYou, needsYouTotal } from '../needsYou';
import type { JiraReport } from '../types';
import { freshPrs, freshReviews, freshSlack, jiraReport } from './fixtures';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * The board with times-in-status, which the fixtures leave off — a pull only reads changelogs
 * for the statuses configured as worth aging. The feed no longer draws rows from the board, so
 * this is here to prove exactly that: an aged, stuck ticket produces no row.
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
  args: { ...feed() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof NeedsYou>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every verb group at once. Needs a raised limit to show them: the lightest weights fall off
 * first at the dashboard's own limit of seven, which is the ordering working, not a bug.
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

/**
 * With snoozing wired up: every row carries a "not today", and the line underneath says how
 * many are being held back. The count in the head stays the whole queue — a number that
 * shrinks when a row is dismissed is the failure this dashboard exists to avoid.
 */
export const Snoozing: Story = {
  args: { ...feed({ limit: 20 }), onSnooze: () => {}, snoozed: 2, onToggleSnoozed: () => {} },
};

/** Snoozed rows while they are being shown: set aside, still readable. */
export const SnoozedShown: Story = {
  args: {
    ...feed({ limit: 20 }),
    onSnooze: () => {},
    snoozed: 2,
    showSnoozed: true,
    onToggleSnoozed: () => {},
    // The first two rows of whatever the feed produced, so the story does not name real ids.
    isSnoozed: (id: string) => id.endsWith('71') || id.endsWith('74'),
  },
};
