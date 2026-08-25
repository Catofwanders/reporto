import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandsPage } from '../pages/CommandsPage';

/**
 * The page reads `/api/kit` from the dev server, which Storybook does not run — so this
 * story documents the empty and error states rather than pretending to hold a kit. The
 * populated view is only honest against a real `~/.claude`.
 */
const meta = {
  title: 'Pages/Commands',
  component: CommandsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CommandsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoApi: Story = {};
