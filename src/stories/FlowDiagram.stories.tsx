import type { Meta, StoryObj } from '@storybook/react-vite';
import { FlowDiagram } from '../components/FlowDiagram';
import type { ProjectFlow } from '../types';

/** Invented: the real flows describe an employer's systems and live in gitignored config. */
const registration: ProjectFlow = {
  id: 'registration',
  title: 'User registration',
  what: 'Sign-up, confirmation, first sign-in.',
  source: 'src/flows/registration.ts',
  actors: [
    { id: 'user', label: 'Visitor' },
    { id: 'web', label: 'Web client' },
    { id: 'api', label: 'API' },
    { id: 'mail', label: 'Mail' },
  ],
  steps: [
    { id: 'r1', actor: 'user', label: 'Fills the form' },
    { id: 'r2', actor: 'web', label: 'Submits', ref: 'POST /accounts' },
    { id: 'r3', actor: 'api', label: 'Creates the account', ref: 'state: pending' },
    { id: 'r4', actor: 'mail', label: 'Sends the confirm link' },
    { id: 'r5', actor: 'user', label: 'Opens the link' },
    { id: 'r6', actor: 'api', label: 'Confirms it', ref: 'POST /accounts/:id/confirm' },
  ],
};

const meta = {
  title: 'Charts/FlowDiagram',
  component: FlowDiagram,
  args: { flow: registration },
} satisfies Meta<typeof FlowDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four lanes: every hand-off between them is a crossing you can count. */
export const Handoffs: Story = {};

/** One lane: consecutive steps connect straight down, with no elbows. */
export const SingleLane: Story = {
  args: {
    flow: {
      ...registration,
      id: 'single',
      title: 'All in one place',
      actors: [{ id: 'web', label: 'Web client' }],
      steps: registration.steps.slice(0, 3).map((step) => ({ ...step, actor: 'web' })),
    },
  },
};

/** A single step still draws: no connector, no division by zero. */
export const OneStep: Story = {
  args: { flow: { ...registration, id: 'one', steps: registration.steps.slice(0, 1) } },
};
