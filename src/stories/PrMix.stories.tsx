import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrMix } from '../components/PrMix';
import { freshPrs, prsReport } from './fixtures';

const fresh = freshPrs();

const meta = {
  title: 'Panels/PrMix',
  component: PrMix,
  args: { report: fresh },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PrMix>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The fixtures fill every lane, so the bar shows all four segments and their proportions. */
export const AllLanes: Story = {};

/**
 * One lane holding everything. The bar is a single block — correct, and the reason the counts
 * stay as labels: proportion says nothing when there is only one part.
 */
export const OneLane: Story = {
  args: {
    report: {
      ...fresh,
      repos: fresh.repos.map((group) => ({
        ...group,
        prs: group.prs.map((pr) => ({
          ...pr,
          review: 'APPROVED' as const,
          draft: false,
          deployQc: { status: 'IDENTICAL' as const, aheadBy: 0, behindBy: 0 },
        })),
      })),
    },
  },
};

/** No open PRs: the component renders nothing at all rather than an empty bar. */
export const Empty: Story = { args: { report: { ...prsReport, repos: [] } } };
