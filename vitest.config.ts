import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Its own config rather than `test` inside `vite.config.ts`: that file's plugins are the dev
 * server's write APIs — they spawn pulls, read `~/.claude` and touch the report directory —
 * and none of that belongs in a test run.
 *
 * The default environment is `node`, because most of what is worth covering here is pure
 * derivation over report shapes. The two files that render React say so with a
 * `@vitest-environment jsdom` docblock, which keeps the rest of the suite fast.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    /*
     * The suite runs in UTC, whatever the machine is set to.
     *
     * Half of this codebase is about local dates — the stand-up window, the snooze that lasts
     * until tomorrow, the report filenames — and a test that inherits the developer's zone
     * asserts something about that laptop. One did: it passed at +03 and failed in CI at UTC,
     * and running the suite across zones then turned up a second one that only broke at +14.
     *
     * So the default is fixed here, and a test whose *subject* is local time names its zone
     * explicitly (`inZone` in `server/standup.test.mjs`) rather than relying on this.
     */
    env: { TZ: 'UTC' },
    /*
     * The server half is plain `.mjs` and runs under the same node environment. It used to be
     * outside the suite entirely, which meant every fix in a puller — a null fallback, a date
     * window, a status compare — was verified once by hand and by nothing afterwards.
     */
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.mjs'],
    // Storybook's addon runs stories as tests in a browser; that is a separate concern and
    // would drag Playwright into `npm test`.
    exclude: ['**/node_modules/**', '**/*.stories.tsx'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.mjs'],
      exclude: [
        'src/**/*.test.*',
        'server/**/*.test.mjs',
        'src/stories/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});
