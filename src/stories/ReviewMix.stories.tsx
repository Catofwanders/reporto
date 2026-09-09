import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewMix } from '../components/ReviewMix';
import { freshReviews, reviewsReport } from './fixtures';

const fresh = freshReviews();

const meta = {
  title: 'Panels/ReviewMix',
  component: ReviewMix,
  args: { report: fresh, jira: null },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReviewMix>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The fixtures fill all three groups: two waiting on you, two on others, one robot. */
export const AllGroups: Story = {};

/**
 * Nothing but bot PRs. The bar is one grey block — the point of keeping automation as its own
 * segment, since a queue of five dependency bumps must not read as five reviews to do.
 */
export const BotsOnly: Story = {
  args: { report: { ...fresh, prs: fresh.prs.map((pr) => ({ ...pr, bot: true })) } },
};

/** An empty queue says so; a missing card and nothing to review must not look alike. */
export const Empty: Story = { args: { report: { ...reviewsReport, prs: [] } } };
