import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TicketDrawer } from '../components/TicketDrawer';
import type { TicketDetail } from '../ticketDetail';
import { jiraReport, prsReport, ticketDetail } from './fixtures';

const ticket = jiraReport.groups[0].tickets[0];
/** The QC-READY ticket whose merged PR is no longer on deploy-qc. */
const dropped = jiraReport.groups[1].tickets[1];

/**
 * The drawer fetches `/api/jira/<KEY>` on mount, and Storybook has no dev server behind it —
 * so each story stubs `fetch` for its own answer. Stubbing at the fetch boundary rather than
 * mocking the module keeps the component's own loading and error handling in the story.
 */
const serve =
  (answer: (input?: RequestInfo | URL) => Promise<Response>) =>
  (Story: () => ReactNode) => {
    window.fetch = answer as typeof window.fetch;
    return <Story />;
  };

/**
 * Answers for whichever key the drawer asked about, rather than one fixed ticket — otherwise a
 * story about one ticket shows another one's summary, which is a story that lies.
 */
const json = (detail: TicketDetail) => (input?: RequestInfo | URL) => {
  const key = String(input ?? '').split('/').pop() || detail.key;
  const board = jiraReport.groups.flatMap((group) => group.tickets).find((t) => t.key === key);
  const answer: TicketDetail = board
    ? { ...detail, key, summary: board.summary, status: board.status, chip: board.chip as TicketDetail['chip'] }
    : detail;
  return Promise.resolve(
    new Response(JSON.stringify({ ok: true, ticket: answer }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
};

const meta = {
  title: 'Panels/TicketDrawer',
  component: TicketDrawer,
  args: { ticket, prs: prsReport, onClose: () => {}, onChanged: () => {} },
  parameters: { layout: 'fullscreen' },
  decorators: [serve(json(ticketDetail))],
} satisfies Meta<typeof TicketDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A ticket read in place: fields, description, comments. */
export const Loaded: Story = {};

/**
 * A ticket whose merged PR has dropped off deploy-qc. The board card carries this warning
 * already; the drawer keeps it, because "done" on the board and "not deployed" in the repo is
 * the contradiction the whole flow-check card exists for.
 */
export const DroppedFromQc: Story = { args: { ticket: dropped } };

/** Nothing written on the ticket yet — said, rather than left as empty space. */
export const Bare: Story = {
  decorators: [serve(json({ ...ticketDetail, description: null, comments: [], labels: [], parent: null }))],
};

/**
 * Still fetching. The card's own facts — key, summary, status — are already on screen, so
 * opening a ticket never shows an empty panel, only a filling one.
 */
export const Loading: Story = {
  decorators: [serve(() => new Promise<Response>(() => {}))],
};

/**
 * A static build, or the dev server stopped. The shimmers must not survive this: a
 * placeholder that keeps shimmering claims something is still on its way.
 */
export const NoApi: Story = {
  decorators: [
    serve(() =>
      Promise.resolve(new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })),
    ),
  ],
};
