import type { Meta, StoryObj } from '@storybook/react-vite';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import TimerRoundedIcon from '@mui/icons-material/TimerRounded';
import { SparkCard } from '../components/SparkCard';
import { DELIVERY_METRICS, chronological } from '../statsMetrics';
import { statsReport } from './fixtures';

const months = chronological(statsReport);

const meta = {
  title: 'Charts/SparkCard',
  component: SparkCard,
  args: { metric: DELIVERY_METRICS[0], months, icon: RocketLaunchRoundedIcon },
  decorators: [(Story) => <div style={{ maxWidth: '15rem' }}>{Story()}</div>],
} satisfies Meta<typeof SparkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rising: Story = {};

/** Falling is the good direction here, so the delta stays green. */
export const LowerIsBetter: Story = {
  args: { metric: DELIVERY_METRICS[3], icon: TimerRoundedIcon },
};

/** One month of data: no delta rather than a made-up "+0". */
export const FirstMonth: Story = { args: { months: months.slice(-1) } };
