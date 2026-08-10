# reporto

A personal dashboard for daily work triage: mail, calendar, Jira tickets, and my open
pull requests, each rendered from a JSON report on disk.

**This is a single-user, local-only app by design.** See
[Why it stays local](#why-it-stays-local) before considering deploying it anywhere.

## Running it

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Use `npm run dev`, not `npm run preview`. The write and refresh APIs live in a Vite
dev-server plugin (`vite.config.ts`), so a production build is a static site with no
API: no refresh buttons that work, no todo persistence.

## How data gets in

Reports are JSON files in `public/reports/`, listed by `index.json`:

| File | Written by | Contents |
|---|---|---|
| `email-<date>.json` | `/email` skill | actionable mail from Gmail + Outlook |
| `calendar-<date>.json` | `/email` skill | today's events, upcoming watch-list |
| `jira-<date>.json` | `/jira` skill | active tickets, PRs, deploy-qc status |
| `prs-<date>.json` | `/jira` skill | my open PRs grouped by repo |

The TypeScript types in `src/types.ts` are the schema of record. The skills that
produce these files live in `~/.claude/docs/email-helper.md` and `jira-helper.md`.

`db/<date>.json` is a per-day snapshot of the reports plus todo state (checked,
deleted, checkedAt) so work can be tracked over time. It is written through the API,
never by hand.

**Neither `public/reports/` nor `db/` is committed** — both are gitignored. They hold
mail subjects, meeting join links (some with embedded passwords), and ticket detail,
which has no business in a git remote. A fresh checkout therefore starts with no data:
the cards stay hidden and the action bar reads "never" until you press an update
button.

## Configuration

```bash
cp -r config.template config     # then edit config/reporto.json
```

`config/` is gitignored and holds anything specific to you — the GitHub org the Jira
refresh may query, and which slash command produces which reports. Details in
[`config.template/README.md`](config.template/README.md). Without it the committed
template is used as a fallback.

## Update buttons

Each card and the header action bar have an update button. It `POST`s to
`/api/refresh/<kind>`, which spawns the matching Claude Code slash command:

- `email` and `calendar` → `claude -p "/email"`
- `jira` and `prs` → `claude -p "/jira"`

Both members of a pair are regenerated together, because one skill run writes both
files. When the run exits 0, the client reloads only the affected reports.

A headless `claude -p` run cannot prompt for permission, so the spawn passes an
explicit `--allowedTools` list (see `REFRESH_COMMANDS` in `vite.config.ts`). Without
it the run exits in seconds having fetched nothing. Only one run per command at a
time — a second request gets a 409. Runs are killed after 15 minutes and the log tail
comes back in the response, surfacing in the button's tooltip on failure.

## Security model

The dev server can write files and start agent processes, so it is not a passive
static server:

- Bound to `127.0.0.1` only — never reachable from the LAN.
- Every state-changing request to `/api/db` and `/api/refresh` must have an `Origin`
  matching the server's host **and** an `X-Reporto-Write: 1` header. A cross-origin
  "simple" POST from any page you happen to have open can set neither, which is what
  stops a drive-by request from triggering an agent run.
- `GET` endpoints are unguarded; they only read local report files.

Report data stays out of git (see above), so the repository itself carries no personal
content — only code. The generated files on your disk are another matter: keep them
local.

## Why it stays local

Report generation runs as *me*, which is the whole reason it needs no integration
work — and exactly why it does not generalize to other users:

1. **Credentials are the current session's.** `/email` drives my logged-in Chrome
   (Gmail + Outlook); `/jira` uses my `gh` keyring auth and my OAuth'd Atlassian MCP
   connection. Serving other people means real per-user OAuth for Google, Microsoft,
   GitHub, and Jira, with encrypted server-side tokens — and dropping the
   browser-automation path entirely.
2. **Storage is global.** Reports are static files any page load can fetch, and
   `db/<date>.json` has no notion of who is asking. Multi-user needs a datastore
   keyed by user and authorization on every read and write.
3. **There is no server or auth.** The API only exists in dev mode.
4. **Job execution is a single in-memory lock.** Fine for one person; N users need
   per-user queued jobs with status and concurrency limits.

If teammates should see these reports, publish read-only snapshots instead. If they
want their own dashboard, they clone the repo and run their own copy against their
own Chrome and `gh` — N private instances, no auth layer to build.

## Layout

```
config/             your settings (gitignored)
config.template/    committed template to copy
public/reports/     report JSON + index.json (gitignored)
db/                 per-day snapshots and todo state (gitignored)
src/pages/          Home, Email, Jira, Calendar routes
src/components/     cards, widgets, donut, accordion, refresh button
src/types.ts        report schemas
src/db.ts           day-file client
src/refresh.tsx     refresh state + provider
vite.config.ts      db API, refresh API, cross-site guard
```

## Notes

- `@rolldown/binding-darwin-arm64` is pinned as a devDependency to work around npm
  skipping the optional native binding ([npm/cli#4828]). Remove it once a later npm
  installs it reliably.
- MUI supplies the accordions, checkboxes, and icon buttons; everything else is plain
  CSS with light/dark tokens in `src/index.css`.

[npm/cli#4828]: https://github.com/npm/cli/issues/4828
