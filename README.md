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
| `jira-<date>.json` | `/jira` skill | active tickets with their PRs |
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

## Committing

This repository belongs to the `Catofwanders` account and **only that identity commits
here** — set repo-locally, overriding whatever global git identity is configured for other
projects:

```bash
git config user.name  "Catofwanders"
git config user.email "23452775+Catofwanders@users.noreply.github.com"
```

## Configuration

```bash
cp -r config.template config     # then edit config/reporto.json
```

`config/` is gitignored and holds anything specific to you — the GitHub org the Jira
refresh may query, and which slash command produces which reports. Details in
[`config.template/README.md`](config.template/README.md). Without it the committed
template is used as a fallback.

## Update buttons

Jira and PRs can be refreshed from the dashboard. Mail and calendar cannot, and carry no
button at all — those cards only show how old their data is.

| Report | How it refreshes |
|---|---|
| `prs` | `POST /api/pull/prs` — one GitHub GraphQL call, about a second (bolt icon) |
| `jira` | `POST /api/refresh/jira` — spawns `claude -p "/jira"`, minutes (refresh icon) |
| `email`, `calendar` | run `/email` in your own Claude Code session |

Mail and calendar read both inboxes through the Chrome extension, and that extension
attaches only to an interactive session you started — a spawned `claude -p` run has no
`mcp__claude-in-chrome__*` tools at all and aborts having read nothing. So there is nothing
for a button to do. Run the skill yourself; when you switch back to the browser tab the
dashboard reloads and picks up the files it wrote.

A spawned run counts as successful only if it actually rewrote a report file: a skill that
cannot do its job may still exit 0 after explaining why, so exit status alone would report
a success that changed nothing.

Only one run per command at a time; a second request during a run waits for it and then
loads its output. Runs get SIGTERM at 15 minutes and SIGKILL ten seconds later, and the
request always answers even if the child never dies, so the lock cannot wedge.

## PR actions

Each row in "My open PRs" has a menu — mark ready for review, convert to draft, or close.
`POST /api/pr/<repo>/<num>/<action>` applies it with the same pinned GitHub token as the
puller, behind the same cross-site guard. The action must be one of four the server knows;
**merging is not one of them and never will be.** Closing asks for confirmation first,
naming the repo, number and title, since it is the only one that discards work.

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
src/emailRows.ts    shared mail-row/todo-id derivation
src/reportSchema.ts report shape guards
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
