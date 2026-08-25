import type { Meta, StoryObj } from '@storybook/react-vite';
import { RefreshContext, type RefreshStatus } from '../refreshContext';
import type { ReportKind } from '../reportKinds';
import { RefreshButton } from '../components/RefreshButton';

const base: RefreshStatus = {
  running: new Set<ReportKind>(),
  errors: {},
  commandOf: { calendar: '/calendar' },
  apiKinds: new Set<ReportKind>(['jira', 'prs']),
  canRefresh: (kind) => kind === 'jira' || kind === 'prs',
  run: () => Promise.resolve(),
  runAll: () => Promise.resolve(),
};

/** Each story supplies its own context, since the button reads all of its state from there. */
const withStatus = (status: Partial<RefreshStatus>) => (Story: () => React.ReactElement) => (
  <RefreshContext.Provider value={{ ...base, ...status }}>
    <Story />
  </RefreshContext.Provider>
);

const meta = {
  title: 'Controls/RefreshButton',
  component: RefreshButton,
  args: { kind: 'prs' },
} satisfies Meta<typeof RefreshButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** API-pulled kinds get the bolt: seconds, no agent run. */
export const ApiPull: Story = {};

/** A kind produced by a slash command gets the circular-arrow icon instead. */
export const AgentRun: Story = {
  args: { kind: 'calendar' },
  decorators: [withStatus({ canRefresh: () => true, apiKinds: new Set<ReportKind>() })],
};

export const Running: Story = {
  decorators: [withStatus({ running: new Set<ReportKind>(['prs']) })],
};

export const Failed: Story = {
  decorators: [withStatus({ errors: { prs: 'gh: HTTP 403 rate limit exceeded' } })],
};

/**
 * A kind with neither a puller nor a configured command cannot be refreshed from the app
 * at all, so the button renders nothing rather than offering a guaranteed failure.
 */
export const NotRefreshable: Story = { args: { kind: 'calendar' } };
