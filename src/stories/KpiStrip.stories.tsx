import type { Meta, StoryObj } from '@storybook/react-vite';
import { KpiStrip } from '../components/KpiStrip';

type Kind = 'prs' | 'reviews' | 'slack' | 'jira';

/** Annotated as returning `boolean`: an inferred type predicate would not fit the prop. */
const every = (_kind: Kind): boolean => true;
const only =
  (...kinds: Kind[]) =>
  (kind: Kind): boolean =>
    kinds.includes(kind);

const meta = {
  title: 'Panels/KpiStrip',
  component: KpiStrip,
  args: {
    counts: { prs: 4, reviews: 2, tickets: 5, stuck: 1, conflicts: 2 },
    usable: every,
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof KpiStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A normal morning: every tile has a number, and the three tones are all on screen. */
export const Busy: Story = {};

/**
 * Nothing outstanding. The tiles stay — a strip that dropped its zeros would change shape
 * between loads, and "nothing to review" is worth reading.
 */
export const AllClear: Story = {
  args: { counts: { prs: 0, reviews: 0, tickets: 0, stuck: 0, conflicts: 0 } },
};

/**
 * Jira switched off in Settings: its two tiles are absent rather than showing zero. The
 * conflicts tile stays — it reads both sources, and drops the checks it cannot run.
 */
export const WithoutJira: Story = {
  args: { usable: only('prs', 'reviews', 'slack') },
};
