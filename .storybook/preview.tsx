import type { Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { RefreshContext, type RefreshStatus } from '../src/refreshContext';
import type { ReportKind } from '../src/reportKinds';
import '../src/index.css';

/**
 * The real provider polls /api/refresh and spawns work; in a story there is no server, so
 * stand in a value that behaves like a settled provider. `run` resolves without doing
 * anything, which is what a story wants from a button press.
 */
const refreshStub: RefreshStatus = {
  running: new Set<ReportKind>(),
  errors: {},
  commandOf: { email: '/email', calendar: '/email' },
  apiKinds: new Set<ReportKind>(['jira', 'prs']),
  canRefresh: (kind) => kind === 'jira' || kind === 'prs',
  run: () => Promise.resolve(),
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      // .wrap and the widget column mirror the app shell, so padding and max-width match
      // what these components actually render inside.
      <MemoryRouter>
        <RefreshContext.Provider value={refreshStub}>
          <div className="wrap" style={{ padding: '1.5rem' }}>
            <Story />
          </div>
        </RefreshContext.Provider>
      </MemoryRouter>
    ),
  ],
};

export default preview;
