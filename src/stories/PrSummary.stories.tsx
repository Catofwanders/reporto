import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrSummary } from '../components/PrSummary';
import { prsReport } from './fixtures';

const meta = {
  title: 'Panels/PrSummary',
  component: PrSummary,
  args: { report: prsReport },
} satisfies Meta<typeof PrSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Nothing is waiting on anybody else, so the copy button has no links to offer and
 * disables itself.
 */
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

export const Empty: Story = { args: { report: { ...prsReport, repos: [] } } };
