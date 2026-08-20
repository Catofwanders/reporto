import type { Meta, StoryObj } from '@storybook/react-vite';
import { OpenPrList } from '../components/OpenPrList';
import { prsReport } from './fixtures';

const meta = {
  title: 'Panels/OpenPrList',
  component: OpenPrList,
  args: { report: prsReport, onChanged: () => {} },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OpenPrList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The fixture carries one PR per state, so this doubles as the reference for the split
 * pill: review state on the left, deploy-qc state on the right.
 */
export const Default: Story = {};

/** No open PRs: repo groups disappear and the counts all read zero. */
export const Empty: Story = {
  args: { report: { ...prsReport, repos: [] } },
};

/** Every PR reviewed and on QC — what a quiet morning looks like. */
export const AllApproved: Story = {
  args: {
    report: {
      ...prsReport,
      repos: prsReport.repos.map((group) => ({
        ...group,
        prs: group.prs.map((pr) => ({
          ...pr,
          draft: false,
          review: 'APPROVED' as const,
          unresolvedThreads: 0,
          deployQc: { status: 'BEHIND' as const, aheadBy: 0, behindBy: 6 },
        })),
      })),
    },
  },
};

/**
 * A report written before the puller carried timestamps: the review state falls back to
 * what reviewDecision alone can say, and the QC half of the pill is absent rather than
 * guessed.
 */
export const LegacyReportWithoutQcData: Story = {
  args: {
    report: {
      ...prsReport,
      repos: prsReport.repos.map((group) => ({
        ...group,
        prs: group.prs.map(({ deployQc: _qc, lastReviewAt: _r, lastCommitAt: _c, ...pr }) => pr),
      })),
    },
  },
};
