import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrLanes } from '../components/PrLanes';
import { prsReport } from './fixtures';

const meta = {
  title: 'Panels/PrLanes',
  component: PrLanes,
  args: { report: prsReport, onChanged: () => {} },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PrLanes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The fixtures cover every review state, so this shows all four lanes at once. */
export const AllLanes: Story = {};

/** Nothing waiting on anybody else: the copy-links button is absent, not disabled. */
export const NothingToNudge: Story = {
  args: {
    report: {
      ...prsReport,
      repos: prsReport.repos.map((group) => ({
        ...group,
        prs: group.prs.map((pr) => ({ ...pr, review: 'APPROVED' as const, draft: false })),
      })),
    },
  },
};

/** A day with no open PRs at all. */
export const Empty: Story = { args: { report: { ...prsReport, repos: [] } } };
