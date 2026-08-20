import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip } from '../components/Chip';
import type { Chip as ChipTone } from '../types';

const meta = {
  title: 'Primitives/Chip',
  component: Chip,
  args: { tone: 'ok', children: 'approved' },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every tone side by side — the reference for which colour means what. */
export const AllTones: Story = {
  render: () => {
    const tones: { tone: ChipTone; label: string }[] = [
      { tone: 'ok', label: 'approved' },
      { tone: 'bad', label: 'changes requested' },
      { tone: 'warn', label: 'awaiting re-review' },
      { tone: 'open', label: 'awaiting review' },
      { tone: 'na', label: 'draft' },
      { tone: 'qc', label: 'on QC' },
      { tone: 'qcout', label: 'off QC · 4' },
    ];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
        {tones.map(({ tone, label }) => (
          <Chip key={tone} tone={tone}>
            {label}
          </Chip>
        ))}
      </div>
    );
  },
};
