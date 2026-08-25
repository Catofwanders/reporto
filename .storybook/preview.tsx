import type { Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { PALETTES } from '../src/theme';
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
  runAll: () => Promise.resolve(),
};

const preview: Preview = {
  // The app applies the palette to <html> at boot; stories get a toolbar instead, so any
  // component can be reviewed in every palette without editing localStorage by hand.
  globalTypes: {
    palette: {
      description: 'Colour palette',
      toolbar: {
        title: 'Palette',
        icon: 'paintbrush',
        items: PALETTES.map((p) => ({ value: p.id, title: p.name })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { palette: 'default' },
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story, context) => {
      const palette = String(context.globals.palette ?? 'default');
      if (palette === 'default') delete document.documentElement.dataset.palette;
      else document.documentElement.dataset.palette = palette;
      return <Story />;
    },
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
