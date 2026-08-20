import type { Meta, StoryObj } from '@storybook/react-vite';
import { Donut } from '../components/Donut';

const meta = {
  title: 'Primitives/Donut',
  component: Donut,
  args: {
    centerValue: 3,
    centerLabel: 'need action',
    slices: [
      { label: 'Need action', value: 3, cssColor: 'var(--bad-ink)' },
      { label: 'Done', value: 1, cssColor: 'var(--ok-ink)' },
      { label: 'No action', value: 2, cssColor: 'var(--na-ink)' },
    ],
  },
} satisfies Meta<typeof Donut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** One slice: the gap between segments collapses so the ring stays unbroken. */
export const SingleSlice: Story = {
  args: {
    centerValue: 4,
    slices: [{ label: 'Need action', value: 4, cssColor: 'var(--bad-ink)' }],
  },
};

/** Nothing to show — the track renders alone rather than a zero-length arc. */
export const Empty: Story = {
  args: {
    centerValue: 0,
    slices: [{ label: 'Need action', value: 0, cssColor: 'var(--bad-ink)' }],
  },
};
