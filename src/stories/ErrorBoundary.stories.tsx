import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorBoundary } from '../components/ErrorBoundary';

const Boom = (): React.ReactElement => {
  throw new Error('report JSON did not match the schema');
};

const meta = {
  title: 'Shell/ErrorBoundary',
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: { children: <p className="subj">A card that rendered fine.</p> },
};

/**
 * What a malformed report looks like: the boundary keeps the rest of the dashboard alive.
 * Storybook logs the caught error to the console — that is the throw below, not a bug.
 */
export const Caught: Story = { args: { children: <Boom /> } };
