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
    include: ['src/**/*.test.{ts,tsx}'],
    // Storybook's addon runs stories as tests in a browser; that is a separate concern and
    // would drag Playwright into `npm test`.
    exclude: ['**/node_modules/**', '**/*.stories.tsx'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/stories/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
