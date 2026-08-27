import type { Meta, StoryObj } from '@storybook/react-vite';
import { FlowChecks } from '../components/FlowChecks';
import type { JiraReport, PrsReport, Ticket } from '../types';
import { jiraReport, prsReport } from './fixtures';

const ticket = (key: string, status: string, prs: Ticket['prs']): Ticket => ({
  key,
  url: `https://example.com/${key}`,
  status,
  chip: 'na',
  summary: `${key} — invented for the story`,
  prs,
  notes: [],
});

/** One report per contradiction, so every check has a case it fires on. */
const contradictory: JiraReport = {
  ...jiraReport,
  groups: [
    {
      title: 'Ready for QA',
      tickets: [
        ticket('DEMO-1', 'Ready for QA', [
          { repo: 'orders-api', num: 11, url: 'https://example.com/pr11', state: 'open' },
        ]),
      ],
    },
    {
      title: 'Ready to ship',
      tickets: [
        ticket('DEMO-3', 'Ready to ship', [
          {
            repo: 'orders-api',
            num: 13,
            url: 'https://example.com/pr13',
            state: 'merged',
            inQc: false,
          },
        ]),
        ticket('DEMO-4', 'Ready to ship', []),
      ],
    },
  ],
};

const offQc: PrsReport = {
  ...prsReport,
  repos: [
    {
      repo: 'orders-api',
      prs: [
        {
          num: 11,
          title: 'Work deploy-qc has not got',
          url: 'https://example.com/pr11',
          ticket: 'DEMO-1',
          ticketUrl: 'https://example.com/DEMO-1',
          review: 'APPROVED',
          draft: false,
          updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          deployQc: { status: 'AHEAD', aheadBy: 2, behindBy: 1 },
        },
      ],
    },
  ],
};

const meta = {
  title: 'Panels/FlowChecks',
  component: FlowChecks,
  args: { jira: contradictory, prs: offQc },
} satisfies Meta<typeof FlowChecks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Findings: Story = {};

/**
 * The everyday fixtures, which carry two contradictions rather than none: the marketplace
 * board has a merged PR that fell off the QC branch, and an approved PR sitting idle. Named
 * "Agreeing" when the fixtures were thinner, and the count has been two for a while — the
 * point of the story is the quiet case, not an empty card.
 */
export const Agreeing: Story = { args: { jira: jiraReport, prs: prsReport } };

/** A missing report is not an error; the checks that can still run, run. */
export const NoPrReport: Story = { args: { prs: null } };
