import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportAccordion } from '../components/ReportAccordion';

const meta = {
  title: 'Primitives/ReportAccordion',
  component: ReportAccordion,
  args: {
    title: 'orders-api',
    count: 3,
    children: <p className="subj">Rows go here.</p>,
  },
} satisfies Meta<typeof ReportAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = { args: { defaultExpanded: false } };

export const WithMeta: Story = { args: { meta: 'you@example.com' } };
