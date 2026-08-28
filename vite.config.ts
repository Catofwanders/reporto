import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { buildPlugin } from './server/api/build.js'
import { jiraPlugin } from './server/api/jira.js'
import { kitPlugin } from './server/api/kit.js'
import { prActionPlugin } from './server/api/pr.js'
import { projectsPlugin } from './server/api/projects.js'
import { pullPlugin } from './server/api/pull.js'
import { refreshPlugin } from './server/api/refresh.js'
import { settingsPlugin } from './server/api/settings.js'
import { slackPlugin } from './server/api/slack.js'
import { standupPlugin } from './server/api/standup.js'

/**
 * The app is a renderer over JSON files; everything that fetches or writes lives in the dev
 * server, one plugin per endpoint under `server/api/`. That is the whole security model in a
 * sentence: a production build is a static site, so none of it ships.
 *
 * This file used to hold all nine plugins and reached 850 lines, at which point two of its doc
 * comments had drifted away from the code they described. It is a plugin list again.
 */
export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars, and only to the client. The pullers run in this
  // process and need the raw ones, so lift .env into the environment by hand.
  for (const [key, value] of Object.entries(loadEnv(mode, __dirname, ''))) {
    // An empty var is as good as unset here: a placeholder line left blank in .env must not
    // win over a value filled in later, which `??=` would have let it do.
    if (!process.env[key]) process.env[key] = value
  }

  return {
    server: {
      // Loopback only: the dev server exposes file writes and agent runs, so it must not be
      // reachable from the LAN.
      host: '127.0.0.1',
      /*
       * Vite serves anything inside the project root, and its default deny-list is only
       * dotfiles and keys — so `GET /config/projects.json` used to answer 200 with the
       * gitignored file whose entire reason for living behind `/api/projects` is that it names
       * client systems. Absolute patterns, because `deny` matches the resolved path.
       */
      fs: {
        deny: [path.join(__dirname, 'config/**'), path.join(__dirname, '.claude/**')],
      },
    },
    plugins: [
      react(),
      kitPlugin(),
      standupPlugin(),
      projectsPlugin(),
      settingsPlugin(),
      slackPlugin(),
      refreshPlugin(),
      pullPlugin(),
      prActionPlugin(),
      jiraPlugin(),
      buildPlugin(),
    ],
  }
})
