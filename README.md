# reporto

A personal dashboard for daily work triage: Jira tickets, my open pull requests and the
calendar, each rendered from a JSON report on disk.

**This is a single-user, local-only app by design.** See
[Why it stays local](#why-it-stays-local) before considering deploying it anywhere.

![The dashboard: open PRs with review and deploy-qc state, Jira tickets and the calendar
widget](docs/home.jpg)

Rendered from the synthetic fixtures in `src/stories/fixtures.ts` via the `Pages/Home`
story, not from real reports — those hold meeting links and ticket detail and never leave
your disk. The same story in the Nord palette: [docs/home-nord.jpg](docs/home-nord.jpg).

## Running it

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Use `npm run dev`, not `npm run preview`. The write and refresh APIs live in a Vite
dev-server plugin (`vite.config.ts`), so a production build is a static site with no
API: no refresh buttons that work, no Jira transitions, no PR actions.

## How data gets in

Reports are JSON files in `public/reports/`, listed by `index.json`:

| File | Written by | Contents |
|---|---|---|
| `calendar-<date>.json` | server, Google Calendar API; `/email` skill adds Outlook | today's events, upcoming watch-list |
| `jira-<date>.json` | server, Jira REST API | tickets, their PRs, and merged-PR QC state |
| `prs-<date>.json` | server, GitHub GraphQL | my open PRs grouped by repo |
| `stats-<date>.json` | server, Jira REST + GitHub GraphQL + Google Calendar | six months of monthly counts, medians and meeting hours |

The TypeScript types in `src/types.ts` are the schema of record, guarded on load by
`src/reportSchema.ts`.

Jira and PRs need no agent: the server calls the APIs itself, so those two cards work on a
fresh clone as soon as credentials exist. The Outlook half of the calendar cannot work that
way — it is read through the Chrome extension, which attaches only to an interactive Claude
Code session — so it comes from a skill. A sanitized copy lives in [`skills/`](skills/) with
placeholders where the accounts go, alongside the contract any producer must meet.
Output is JSON only; the dashboard is the renderer.

**`public/reports/` is not committed** — it is gitignored. The files hold meeting join
links (some with embedded passwords) and ticket detail, which has no business in a git
remote. A fresh checkout therefore starts with no data:
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
cp .env.example .env             # then add your Jira API token
```

### Google Calendar

Two ways in. A plain API key is not one of them: Google accepts keys only for public data.

**Service account (no browser, no expiry).** Cloud console → enable the Google Calendar API →
create a service account → download its JSON key. Keep the key outside this repo
(`~/.config/reporto/google-sa.json`, `chmod 600`) and point `GOOGLE_SERVICE_ACCOUNT_KEY` at
it. Then, for each calendar: Calendar settings → Share with specific people → add the
service account's `client_email` with "See all event details".

A service account **cannot enumerate calendars** — sharing grants access but does not add
the calendar to its `calendarList`, which stays empty. So `calendarIds` in
`config/reporto.json` must name each calendar address explicitly. An id it cannot read is
logged and skipped rather than failing the pull.

That limitation bites on calendars you do not control: a team calendar you were merely
invited to cannot be shared onward unless you have "make changes and manage sharing", so
its entries stay missing until the owner shares it with the service account.

**Installed-app OAuth (reads everything you can read).** Use it when the above is blocked:

```bash
npm run google-auth   # one-time browser consent; writes GOOGLE_REFRESH_TOKEN to .env
```

Needs a Desktop-app OAuth client with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`
first; scope `calendar.readonly`. This path uses your own `calendarList`, so subscribed
calendars come along without anyone sharing anything.

**Set that consent screen to Internal (Workspace) or In production.** Left in "Testing", Google
expires the refresh token after seven days and the pull starts failing with `invalid_grant` —
the error message says so, but it is worth avoiding.

Recurring events are expanded by Google (`singleEvents=true`), so the stand-up and kick-offs
arrive as concrete instances and no iCal parsing is needed. Declined invitations are dropped,
and conferencing links come through the API — the thing the browser path could never read.

### Jira

The Jira pull authenticates with a personal API token
([create one](https://id.atlassian.com/manage-profile/security/api-tokens)) read from
`JIRA_EMAIL` and `JIRA_API_TOKEN`; `.env` is gitignored and lifted into the environment by
`vite.config.ts`. Without them the Jira card's button returns
`no Jira credentials` and changes nothing. The GitHub side uses your `gh` keyring auth,
pinned to the account in `githubAccount`.

`config/` is gitignored and holds anything specific to you — the GitHub org to query, the
repos pinned to the top of the PR list, and which slash command produces which reports. Details in
[`config.template/README.md`](config.template/README.md). Without it the committed
template is used as a fallback.

## What the PR list shows

Each row carries one split pill: review state on the left, deploy-qc state on the right,
each in its own colour.

GitHub's `reviewDecision` collapses "nobody has looked yet" and "somebody commented and I
have pushed since" into states that read identically in a list, so `src/prState.ts` derives
the difference instead:

| State | Meaning |
|---|---|
| `awaiting review` | nobody but me has reviewed — waiting on a reviewer |
| `commented` | reviewed, no commit since — waiting on me |
| `awaiting re-review` | reviewed, and I pushed after that — waiting on a reviewer again |
| `approved` / `changes requested` | GitHub's own verdicts, kept as they are |

`commented` counts as waiting on me, so it is excluded from the "awaiting review" count and
from the copy-links nudge button.

The right half answers "is this branch on `deploy-qc`?" from one aliased ref comparison per
PR (base `deploy-qc` → head): `aheadBy: 0` means deployed, so both `BEHIND` (QC has moved
on since) and `IDENTICAL` read as **on QC**. Otherwise it shows **off QC · N**, N being the
commits QC has not got. No chip renders at all when there is nothing to claim — a repo
without the branch, a deleted head branch, or a failed comparison — rather than implying a
PR is off QC.

Jira sits below as compact cards, as many per row as the width allows, summaries clamped to
two lines. A card whose **merged** PR is no longer reachable from `deploy-qc` gets a red
chip naming it: a QC branch reset drops merged work silently — the PR still reads as merged
and the ticket still reads as done — so that is the one state worth shouting about.

PRs attach to tickets by key in the PR title. For statuses in `fallbackStatuses` a ticket
with no title match also gets one body search of your own PRs, capped at 15 searches per
pull to stay clear of the search API's 30/minute limit; anything skipped is logged rather
than silently dropped.

## Storybook

```bash
nvm use            # .nvmrc pins 20.19.5
npm run storybook  # http://localhost:6006
```

Every component has stories, driven by **synthetic** fixtures in
[`src/stories/fixtures.ts`](src/stories/fixtures.ts) — never the real reports, which are
gitignored precisely because they hold meeting links and ticket detail. The fixtures are
built to cover the states that are otherwise hard to reach: each PR review state and its
deploy-qc pairing, a merged PR dropped from `deploy-qc`, an all-day-only calendar, a report
written before the puller carried QC data, and empty versions of every panel.

Storybook 10 and Vite 8 both need Node 20.19+, which is why `.nvmrc` exists; the repo
otherwise runs on whatever `node` you have.

## Update buttons

Every card can be refreshed from the dashboard; the calendar's Outlook half is the one
thing a button cannot fetch (see below).

| Report | How it refreshes |
|---|---|
| `prs` | `POST /api/pull/prs` — one GitHub GraphQL call, about a second (bolt icon) |
| `jira` | `POST /api/pull/jira` — one Jira search plus one GitHub search (bolt icon) |
| `calendar` | `POST /api/pull/calendar` — Google Calendar API (bolt icon) |
| `stats` | `POST /api/pull/stats` — Jira, GitHub and Calendar for six months (bolt icon) |

The calendar pull covers **Google only**. Outlook is readable only through the Chrome
extension, so the `/email` skill remains the only thing that can see it — and a pull would
otherwise drop the stand-up that lives there.

Both sides therefore merge instead of overwriting: the puller keeps every event whose
`source` is not `google`, and the skill keeps the Google ones and no longer reads Google
Calendar at all. Whichever runs last, neither half deletes the other.

The top-bar button belongs to the page: on Jira it updates Jira, on the statistics page it
updates the statistics. Only the dashboard, which shows every report at once, offers
**Update all** — and that button starts every refreshable report at once. They are
genuinely independent — separate endpoints, separate report files, and the dev server
answers them concurrently: firing all three together finishes in the time of the slowest
(~17s, Jira) rather than their sum (~20s). Each card clears its own spinner as it lands, so
PRs and calendar are usable while Jira is still going, and the button counts down what is
left. One failing puller does not cancel the others.

All the pulls are plain API calls, so they answer in about a second and cost no tokens. The
agent-spawning path (`POST /api/refresh/<kind>`, `claude -p`) still exists for any command
you list under `commandGroups`, but nothing needs it out of the box.

Outlook is read through the Chrome extension, and that extension attaches only to an
interactive session you started — a spawned `claude -p` run has no
`mcp__claude-in-chrome__*` tools at all and aborts having read nothing. So no button can
fetch it. Run the skill yourself; when you switch back to the browser tab the dashboard
reloads and picks up the files it wrote.

A spawned run counts as successful only if it actually rewrote a report file: a skill that
cannot do its job may still exit 0 after explaining why, so exit status alone would report
a success that changed nothing.

Only one run per command at a time; a second request during a run waits for it and then
loads its output. Runs get SIGTERM at 15 minutes and SIGKILL ten seconds later, and the
request always answers even if the child never dies, so the lock cannot wedge.

## PR actions

Each row in "My open PRs" carries a **Ready for review** / **Convert to draft** button —
labelled with the outcome rather than the state, so it reads like GitHub's own button — and a
menu for what has no button of its own.
`POST /api/pr/<repo>/<num>/<action>` applies it with the same pinned GitHub token as the
puller, behind the same cross-site guard. The action must be one of four the server knows;
**merging is not one of them and never will be.** Closing asks for confirmation first,
naming the repo, number and title, since it is the only one that discards work.

## Changing a ticket's status

The status chip on a Jira card is also the control — it carries a caret to say so. Click it
and the menu lists the statuses `statusChoices` allows, fetched then rather than with the
report: options depend on the current status and differ per project, and asking for thirty
tickets up front would be thirty round trips for a menu that usually stays shut.

Jira offers the entire workflow, which here is twenty-odd statuses including several nobody
moves a ticket to by hand. `statusChoices` in `config/reporto.json` narrows that to the ones
in daily use, matched on a transition's **target status** rather than its name, since Jira
names transitions inconsistently. The filter is applied server-side and re-checked when a
transition is applied, so a stale page cannot reach an excluded status.

`GET /api/jira/<KEY>/transitions` lists them; `POST /api/jira/<KEY>/transition` applies one,
behind the same cross-site guard as the other writes. The key must match a ticket-key shape
and the id must be one Jira just returned, so the request never names a status string. After
it lands the report is refetched rather than patched locally, because a workflow can land
somewhere other than the transition's advertised target.

Jira answers 400 when a transition is no longer valid from the current status — which means
the board moved under you — and that surfaces as "refresh and try again" rather than a raw
error.

## Palettes

`/settings` (the ⚙ beside the title) switches the palette; the choice is saved per browser
in `localStorage` and applied in `main.tsx` before the first render, so it never flashes the
default first. Five ship: Default, Nord, Terracotta, Mono and High contrast.

Tokens are layered so a palette stays short:

1. neutrals — `--bg`, `--panel`, `--ink`, `--ink-2`, `--line`, `--accent`
2. status inks — `--ok-ink`, `--bad-ink`, `--open-ink`, `--na-ink`, `--warn-ink`, `--qc-ink`, `--qcout-ink`
3. chip surfaces — **derived**, `color-mix(in oklab, var(--ok-ink) var(--chip-fill), var(--panel))`

Layer 3 is declared once for every palette. Custom properties resolve lazily, so overriding
`--ok-ink` in a `[data-palette]` block gives you a matching background and border for free —
a new palette means eight hues per mode, not twenty-four. `--chip-fill` / `--chip-edge` let a
palette push its chips louder or quieter, which is what High contrast does.

Light and dark both come from the palette, selected by `prefers-color-scheme`; there is no
in-app light/dark switch.

## Monthly statistics

`/stats` answers "what did last month look like" from the APIs, not from the daily report
files. Those files are day snapshots with gaps — weekends, days off, any day a pull did not
run — so diffing them would invent ticket transitions that never happened and miss the ones
that happened twice between two snapshots.

| Metric | Where it comes from |
|---|---|
| Deployed, release ready, QC failed, assigned | Jira JQL `status changed to "<status>" DURING (month)` for tickets assigned to me |
| Cycle time | per-ticket changelog: last `In Progress` before the ticket reached release ready |
| PRs merged / opened / abandoned | GitHub search, one query per month |
| To first review, to merge | medians over the month's merged PRs; only reviews by somebody else count |
| PRs I reviewed | GitHub `reviewed-by:` — dated by when the PR last moved, which is the only thing search can answer |
| Meeting hours | Google Calendar, timed events only, declined ones excluded |

The status names are this workflow's; a different Jira names them differently, so they are
config (`statsStatuses`), not constants.

Six months live in one file, and a month that has ended is never recomputed: cycle time
costs one changelog request per ticket, so a refresh only pays for the current month.
Whatever a source could not answer is recorded in `notes` and shown on the page — a missing
number reads as missing, never as zero.

## Look and charts

The layout follows the SaaS-admin convention: a dark rail that keeps its dark surface in
both colour schemes, a near-white canvas, and hairline cards with a soft shadow. The rail
carries the nav and each report's freshness stamp, with its update control appearing on
hover; the top bar carries the page heading and **Update all**. There is deliberately no
search box — four reports do not need one, and a search that found nothing would be set
dressing.

Charts are [Recharts](https://recharts.org). It was picked over the alternatives for one
reason that matters here: its colours are plain SVG attributes, so a chart takes
`stroke="var(--ok-ink)"` and the four palettes plus dark mode keep working without any
JavaScript colour plumbing or a re-render per theme switch.

Two rules the charts follow, both of which are about not misleading:

- **One measure per plot.** Counts, days and hours never share an axis; a segmented control
  in the card header switches between them instead. A second y-axis would misstate both
  series on it.
- **A gap is a gap.** A month whose source failed plots as `null` with `connectNulls` off,
  so a hole in the data looks like a hole rather than a drop to zero.

The repo donut is one hue at three steps, not one hue per repo. The status inks this app is
built from are tuned to be read one at a time beside a label, and as a categorical set they
fail: green↔red sits at ΔE 5.3 for a deuteranope and blue↔purple at ΔE 8.7 even with full
colour vision. So the donut carries the two biggest repos plus a folded tail, and the full
ranking sits under it as labelled bars, where identity comes from text.

## The Jira board

`/jira` defaults to a board: one column per status, in **workflow order** rather than the
order the JQL returned — a board is a pipeline, and JQL gives a ranking. A status the order
does not know keeps its place after the ones it does, so an unfamiliar column appears on the
right instead of vanishing. Columns are a fixed width and the row scrolls sideways; a column
that grew with its content would make a busy status wider than a quiet one.

The status chip on a card is still how a ticket moves. Dragging would need a drop target per
column and a guess at which transition a drop means, while the chip asks Jira what the
workflow actually allows for that ticket right now.

A board card holds the summary, its PRs, and a deploy-qc warning when a merged PR is missing
from that branch. Everything else — per-ticket notes, PR remarks — lives in the **List**
view behind the toggle in the card header.

## Open PRs, by who is holding the ball

The PR list is grouped by what has to happen next, not by repo — repo sorts work by where
it lives, which is never the question:

| Lane | What is in it |
|---|---|
| **Needs you** | changes requested, or review threads waiting on an answer |
| **Waiting on others** | no review yet, or pushed since the last one — the lane the copy-links button lives in |
| **Ready to merge** | approved; a row already on deploy-qc gets the accent border |
| **Drafts** | not visible to reviewers, so its review state says nothing |

Each row carries the reason in words — "no review yet — 6 days, chase it", "approved · on QC
— merge it" — instead of leaving two coloured pills to be decoded, and an aging pill that
turns amber at two days and red at four. Empty lanes are not rendered: a heading with
nothing under it still has to be read before it can be dismissed.

The state counts stay above the lanes but only for states that are not zero. Draft ⇄ ready
is a button only in the Drafts lane, where it is the point; sending a live PR back to draft
is rare and lives in the row menu instead of repeating down every row.

## Commands and skills

`/commands` lists every slash command and skill this machine can run — 20 commands and 79
skills at the time of writing, across 13 plugins — with a filter by name, description or
tool, the source each came from, the file to edit it in, and a copy button for the
invocation. It exists because `/help` scrolls past a list that long, and a command you
cannot find is a command you rewrite by hand.

`GET /api/kit` reads it at request time rather than writing a report file: commands are
edited between sessions, so a snapshot would be stale immediately, and the source is a local
directory that costs nothing to walk.

Two things the reader has to get right, both learned the hard way:

- **A plugin keeps every version it ever installed.** Only the newest is live, so the reader
  takes the newest directory per plugin — otherwise three cached figma versions report three
  copies of every figma skill.
- **A marketplace whose source is a local directory installs in place**, never into
  `plugins/cache`, so guessing that layout silently loses those plugins. The reader resolves
  paths from `installed_plugins.json` and `known_marketplaces.json`, and skips plugins that
  `settings.json` has switched off.

## Keeping it current without pressing anything

Two paths, and they share one implementation — `server/reports.mjs` holds the config, the
pullers and the index bookkeeping, so the button in the browser and the cron job do the same
thing rather than two similar things.

**On open.** Anything older than four hours is refetched once per session when the dashboard
loads: an overnight report is worse than useless because it looks current, while reopening a
tab an hour later fetches nothing. Only reports the server can pull itself are touched —
never an agent run — and Settings has the switch if you want it off.

**From cron.** `npm run pull` needs no browser and no dev server:

```bash
npm run pull                 # every report the API can fetch
npm run pull -- jira prs     # just these
```

It exits non-zero if any pull failed, which is what a cron wrapper wants to see. To have the
dashboard current before stand-up, on a Mac that stays awake:

```bash
# crontab -e — 08:45 on weekdays
45 8 * * 1-5 cd /path/to/reporto && /usr/local/bin/node scripts/pull.mjs >> /tmp/reporto-pull.log 2>&1
```

`launchd` is the better fit if the laptop sleeps through 08:45, since a `StartCalendarInterval`
job runs on wake and cron does not.

## The stand-up note

The dashboard builds it on demand: what moved since the last working day (Monday looks back
to Friday), what is in flight, what is stuck, and what the calendar takes today. The first
half is a Jira search plus a changelog read per ticket and one GitHub search — behind a
button, because it is wanted once a day rather than on every visit. The rest is derived from
the reports already on disk. **Copy note** puts it on the clipboard as plain text.

On Hold is deliberately not a blocker: parked work read out every morning is what makes
people stop listening to that part of the note.

## ⌘K

The app's only search, and the reason the top bar has no search box: everything it offers is
already in memory — the tickets and PRs from the two reports, the pages, the update actions,
and the command listing, fetched the first time the palette opens.

Typing `14648` finds the ticket and the PR that names it; `procs` finds the command; `upd
jira` finds the update action. A contiguous match at a word boundary outranks a scattered
one, and the subsequence fallback is capped — without a cap, a ten-letter query can be
spelled out of almost any long skill description.

Choosing a ticket or a PR goes to the page that already shows it, with the key in the hash;
the board or the lane scrolls there and flashes the row once, because landing on a board of
thirty cards with the answer off-screen is technically correct and useless. Choosing a
command copies its invocation — the app cannot run a slash command, that happens in a Claude
session, so copying is the honest action and the palette stays open for the next one.

## The project map

`/projects` answers the questions a new laptop cannot: which repositories exist, what each
one is for, what talks to what, and the route a ticket takes from Backlog to production.

None of it can be derived. A repository does not say what it is for, and no API knows which
service sits behind which gateway — so the map is hand-written in
`config/projects.json`, **gitignored**, because it names an employer's systems and this
remote is public. `config.template/projects.json` is the committed version, invented
throughout; copy it and describe your own work. Without it the page says which file to copy
rather than showing nothing.

Three views over the one file:

- **How work travels** — the ticket route, with a live count of my tickets at each stop, so a
  stage holding nine of them shows where the queue is. A picture of the process alone cannot
  say that.
- **Projects** — a card per repository: what it is, its stack, its base branch, plus how many
  of my PRs are open there and how many merged this month, read from the reports already on
  disk. That last part is why this is not a README.
- **A page per project** — click a card's title. What it is, what it depends on and what
  depends on it, what of mine is open in it right now, and a lane diagram per flow.
- **Backend, high level** — a layered diagram, one row per layer, drawn as inline SVG. Not a
  diagramming dependency and not a force layout: the layer of every node is stated rather
  than solved, because a diagram you read every day must not rearrange itself between
  renders. An edge naming a node that is not on the map is dropped rather than drawn to
  nowhere.

### Flows

A project page draws the paths through it worth knowing — sign-in, a hand-off to a vendor,
job creation — as lanes and ordered steps: each step sits in the lane of whatever performs
it, so a hand-off is a crossing you can count. Elbow connectors rather than curves, because
between two lanes a right angle says "the same step moved sideways" where a bezier suggests
something smoother than a network call.

Every flow carries **where it was read from** (`client/src/sagas/auth.ts`) so a reader can
check it instead of trusting it, and `verified: false` renders as a chip until somebody has
confirmed it against the running system. That distinction matters more than it looks: a
diagram read out of code is a claim about the code, not about production.

The infrastructure rows are a **sketch** and say so on the page — deployment topology is not
documented anywhere the app can read, so it is seeded from what the local skill docs state
and is meant to be corrected by hand.

## Security model

The dev server can write files and start agent processes, so it is not a passive
static server:

- Bound to `127.0.0.1` only — never reachable from the LAN.
- Every state-changing request to `/api/refresh`, `/api/pull`, `/api/pr` and
  `/api/jira` must have an `Origin`
  matching the server's host **and** an `X-Reporto-Write: 1` header. A cross-origin
  "simple" POST from any page you happen to have open can set neither, which is what
  stops a drive-by request from triggering an agent run.
- `GET` endpoints are unguarded; they only read local report files.
- The Jira token lives in `.env` and never reaches the client: pulls run in the dev-server
  process and only the resulting report is served.

Report data stays out of git (see above), so the repository itself carries no personal
content — only code. The generated files on your disk are another matter: keep them
local.

## Why it stays local

Report generation runs as *me*, which is the whole reason it needs no integration
work — and exactly why it does not generalize to other users:

1. **Credentials are mine.** The `/email` skill drives my logged-in Chrome for Outlook
   events; the pulls use my `gh`
   keyring auth and one Jira API token in `.env`. Serving other people means real per-user
   OAuth for Google, Microsoft, GitHub and Jira, with encrypted server-side tokens — and
   dropping the browser-automation path entirely.
2. **Storage is global.** Reports are static files any page load can fetch, with no
   notion of who is asking. Multi-user needs a datastore keyed by user and
   authorization on every read and write.
3. **There is no server or auth.** The API only exists in dev mode.
4. **Job execution is a single in-memory lock.** Fine for one person; N users need
   per-user queued jobs with status and concurrency limits.

If teammates should see these reports, publish read-only snapshots instead. If they
want their own dashboard, they clone the repo and run their own copy against their
own Chrome and `gh` — N private instances, no auth layer to build.

## Layout

```
config/             your settings (gitignored)
skills/             sanitized mail skill + report template, and the report contract
src/prState.ts      PR review state + deploy-qc chip derivation
src/prLanes.ts      which lane a PR is in, its reason line and aging tone
src/kit.ts          client for /api/kit
src/paletteItems.ts what ⌘K offers, and how a query is scored
src/projectMap.ts   client for /api/projects, and the diagram's layout maths
server/kit.mjs      reads the commands and skills installed on this machine
server/reports.mjs  config, the pullers, and the report+index writing they share
server/standup.mjs  what moved since the last working day
scripts/pull.mjs    headless pull, for cron
src/statsMetrics.ts monthly metric definitions, deltas and formatting
src/components/AppShell.tsx  rail + top bar; SideNav and TopBar are its two halves
src/components/JiraBoard.tsx status columns in workflow order, like the Jira board
src/reportSchema.ts report shape guards
config.template/    committed template to copy
public/reports/     report JSON + index.json (gitignored)
src/pages/          Home, Jira, PRs, Calendar, Stats, Settings routes
src/components/     cards, charts, widgets, accordion, refresh button
src/stories/        Storybook stories + synthetic fixtures
.storybook/         Storybook config; preview stubs the router and refresh context
server/github.mjs   open-PR pull, deploy-qc comparison, ticket↔PR match, PR actions
server/jira.mjs     Jira REST pull (JQL → tickets, grouped by status)
server/googleCalendar.mjs  Google Calendar pull; carries over Outlook events
server/stats.mjs    monthly statistics: Jira transitions, PR timings, meeting hours
scripts/google-auth.mjs    one-time OAuth consent → refresh token in .env
.env.example        Jira credentials to copy to .env (gitignored)
src/types.ts        report schemas
src/refresh.tsx     refresh state + provider
vite.config.ts      refresh + pull APIs, PR and Jira actions, cross-site guard
```

## Notes

- `@rolldown/binding-darwin-arm64` is pinned as a devDependency to work around npm
  skipping the optional native binding ([npm/cli#4828]). Remove it once a later npm
  installs it reliably.
- MUI supplies the accordions, checkboxes, and icon buttons; everything else is plain
  CSS with light/dark tokens in `src/index.css`.

[npm/cli#4828]: https://github.com/npm/cli/issues/4828
