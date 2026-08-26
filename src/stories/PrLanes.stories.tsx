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

/**
 * Every row tone at once: approved on deploy-qc takes the full green wash, approved but not
 * yet on it takes the lighter one, a draft is greyed rather than coloured, and anything still
 * in play stays neutral.
 */
export const RowTones: Story = {
  args: {
    report: {
      ...prsReport,
      repos: [
        {
          repo: 'billing-api',
          prs: [
            {
              num: 101,
              title: 'Approved and already on deploy-qc',
              url: 'https://example.com/101',
              ticket: 'KEY-1',
              ticketUrl: 'https://example.com/KEY-1',
              review: 'APPROVED',
              draft: false,
              updatedAt: new Date().toISOString(),
              deployQc: { status: 'BEHIND', aheadBy: 0, behindBy: 3 },
            },
            {
              num: 102,
              title: 'Approved but not on deploy-qc yet',
              url: 'https://example.com/102',
              ticket: 'KEY-2',
              ticketUrl: 'https://example.com/KEY-2',
              review: 'APPROVED',
              draft: false,
              updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
              deployQc: { status: 'AHEAD', aheadBy: 2, behindBy: 1 },
            },
            {
              num: 103,
              title: 'Still a draft',
              url: 'https://example.com/103',
              ticket: null,
              ticketUrl: null,
              review: 'REVIEW_REQUIRED',
              draft: true,
              updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
              deployQc: null,
            },
            {
              num: 104,
              title: 'Waiting on a first review',
              url: 'https://example.com/104',
              ticket: 'KEY-4',
              ticketUrl: 'https://example.com/KEY-4',
              review: 'REVIEW_REQUIRED',
              draft: false,
              updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
              deployQc: null,
            },
          ],
        },
      ],
    },
  },
};
