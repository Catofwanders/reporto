import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrRowActions } from '../components/PrRowActions';
import { prsReport } from './fixtures';

const [ready] = prsReport.repos[0].prs;
const draft = prsReport.repos[1].prs[2];

const meta = {
  title: 'Panels/PrRowActions',
  component: PrRowActions,
  args: { repo: 'billing-api', pr: ready, onChanged: () => {} },
} satisfies Meta<typeof PrRowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Open the ⋮ menu to see the offered actions. They POST to /api/pr/…, which does not exist
 * in Storybook, so a click fails — the menu itself is what this story is for.
 */
export const OpenPr: Story = {};

/** A draft offers "mark ready for review" where an open PR offers "convert to draft". */
export const DraftPr: Story = { args: { repo: 'storefront', pr: draft } };
