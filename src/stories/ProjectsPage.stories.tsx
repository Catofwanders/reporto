import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectsPage } from '../pages/ProjectsPage';
import { jiraReport, prsReport, statsReport } from './fixtures';

/**
 * The map comes from `/api/projects`, which Storybook does not serve — so the story shows
 * the state a fresh checkout lands in: no config, and a message saying which file to copy.
 */
const meta = {
  title: 'Pages/Projects',
  component: ProjectsPage,
  args: { jira: jiraReport, prs: prsReport, stats: statsReport },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProjectsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoConfig: Story = {};
