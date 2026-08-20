import type { Meta, StoryObj } from '@storybook/react-vite';
import { MailWidget } from '../components/MailWidget';
import { summarizeEmail } from '../summary';
import { emailReport, todos } from './fixtures';

const meta = {
  title: 'Widgets/MailWidget',
  component: MailWidget,
  args: { report: emailReport, summary: summarizeEmail(emailReport, todos) },
  decorators: [
    (Story) => (
      // Widgets live in a fixed-width sidebar column; unconstrained they stretch and read
      // nothing like they do in the app.
      <div style={{ maxWidth: '21rem' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MailWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Everything triaged: the donut is all green and the centre reads zero. */
export const AllDone: Story = {
  args: {
    summary: {
      ...summarizeEmail(emailReport, todos),
      needAction: 0,
      done: 5,
      items: 5,
    },
  },
};

export const Empty: Story = {
  args: {
    report: { ...emailReport, sections: [] },
    summary: { needAction: 0, done: 0, items: 0, perSection: [] },
  },
};
