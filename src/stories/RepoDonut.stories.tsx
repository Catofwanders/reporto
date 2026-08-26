import type { Meta, StoryObj } from '@storybook/react-vite';
import { RepoDonut } from '../components/RepoDonut';

const meta = {
  title: 'Charts/RepoDonut',
  component: RepoDonut,
  args: {
    month: '2026-05',
    slices: [
      { repo: 'orders-api', merged: 7 },
      { repo: 'shop-web', merged: 5 },
      { repo: 'search-service', merged: 3 },
      { repo: 'warehouse-service', merged: 2 },
      { repo: 'catalog-api', merged: 1 },
    ],
  },
  decorators: [(Story) => <div style={{ maxWidth: '20rem' }}>{Story()}</div>],
} satisfies Meta<typeof RepoDonut>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five repos: two get their own step, the tail folds into one slice. */
export const Tail: Story = {};

/** Three or fewer and every repo gets its own step of the ramp. */
export const FewRepos: Story = {
  args: { slices: [{ repo: 'orders-api', merged: 6 }, { repo: 'shop-web', merged: 2 }] },
};

export const NothingMerged: Story = { args: { slices: [] } };
