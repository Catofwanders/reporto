# reporto

My morning triage, on one screen. It reads Jira, GitHub, Slack and the calendar, and answers
one question: **what should I do first?**

![The dashboard: six counts across the top, one prioritised queue grouped by what to do,
today as a timeline, open PRs as a proportional bar, and the stand-up note](docs/home.jpg)

Everything in that screenshot is invented example data — see [Development](#development) —
because the real thing is full of ticket detail and meeting links, and this remote is public.

**Single-user and local-only, by design.** It runs on your machine against your own logins.
[Why it stays local](#why-it-stays-local) is worth reading before you consider hosting it
anywhere.

## The idea

Four tabs used to answer that question badly: the board, my PRs, the review queue, Slack. Each
one shows what *exists*. None of them says what is **waiting on me** — so you read all four and
merge them in your head, every morning.

This does the merging:

- **One queue**, grouped by the verb it wants — *Your move · Review · Answer · Merge ·
  Unstick* — ordered by how much each thing is blocking, then by how long it has waited.
- **Six counts** across the top, each one a number you can act on.
- **Today as a line**, because "how long until the next thing" is a distance, not a sentence.
- **Contradictions on one folded line**: places where Jira and GitHub disagree about the same
  work, which is the class of problem nobody notices until QC asks.

Nothing is hidden — every row links to the page that owns it, and those pages carry the full
story.

## Getting started

Node **20.19+** (`.nvmrc` pins 20.19.5; `nvm use` picks it up).

```bash
npm install
cp -r config.template config     # then edit config/reporto.json
cp .env.example .env             # then add your Jira token
npm run dev                      # http://127.0.0.1:5173
```

You will land on an empty dashboard: there is no data until you press an update button, and
each module says what it is still missing. [docs/setup.md](docs/setup.md) covers the
credentials — Jira, GitHub, Google Calendar, Slack — and the config keys.

Use `npm run dev`, not `npm run preview`. The APIs that fetch and write live in a Vite
dev-server plugin, so a production build is a static site: no update buttons, no Jira
transitions, no PR actions.

## How it works

```
Jira · GitHub · Slack · Calendar        ← the APIs
              │
      the dev server pulls              ← server/*.mjs, npm run pull, or an update button
              │
   public/reports/<kind>-<date>.json    ← plain files on your disk, gitignored
              │
        the app renders                 ← it never calls an API itself
```

That split is the whole architecture. The app is a renderer over files, so it works offline,
survives a failed pull with yesterday's data, and can be reasoned about without a network.

| Report | Source | What it holds |
|---|---|---|
| `jira-<date>.json` | Jira REST | my tickets, their PRs, time in status |
| `prs-<date>.json` | GitHub GraphQL | my open PRs, and who is holding each one |
| `reviews-<date>.json` | GitHub GraphQL | PRs waiting on me, and what changed since I looked |
| `slack-<date>.json` | Slack Web API | mentions and DMs nobody has answered |
| `calendar-<date>.json` | Google Calendar API | today, and the week ahead |
| `stats-<date>.json` | all three | six months of counts, medians and meeting hours |

`src/types.ts` is the schema of record and `src/reportSchema.ts` guards it on load. These files
are written by agent runs as well as by the server, so a half-written one is an ordinary
Tuesday — one bad report costs its own card and nothing else.

**Reports are never committed.** They hold meeting links (some with passwords) and ticket
detail; `public/reports/` is gitignored and stays on your disk.

## The pages

| | |
|---|---|
| **Dashboard** | the queue, the counts, today, the stand-up note |
| **Jira** | the board in workflow order, or a list; click a card to read the ticket in place |
| **Pull requests** | my open PRs in four lanes, by who is holding the ball |
| **Reviews** | what is waiting on my review, and what was pushed after I looked |
| **Slack** | mentions and DMs still owed a reply — answerable from the row |
| **Calendar** | today, and the watch-list ahead |
| **Statistics** | six months of delivery, review and meeting load |
| **Projects** | one page per project, with the architecture and flow diagrams it declares |
| **Commands** | the slash commands and skills installed on this machine |

⌘K jumps to any of it — a ticket key, a PR number, a page — and `>` narrows to the things that
*do* something.

## Development

```bash
npm run dev          # the app
npm run storybook    # every component, on invented fixtures
npm test             # vitest
npm run build        # tsc -b + vite build — the real type check
npm run lint         # oxlint
npm run shots        # re-shoot the README screenshots
npm run pull         # headless pull, for cron
```

Stories run on synthetic fixtures describing an invented online marketplace, never on real
reports: example data shaped like the real work describes it even when every name is changed.

Tests cover the **derivation** — the functions that decide what a morning looks like, where a
wrong answer is plausible enough to survive review. Those sit at or near 100%; the tree is
around 42%, because components are checked in Storybook and in the browser. Three of the tests
exist because the bug shipped first: a base-branch merge must not read as a push, an unmeasured
ticket must not render as "0 days", and a `javascript:` href in a Jira description must never
become a link.

## Security model

The dev server writes files and starts processes, so it is not a passive static server:

- Bound to `127.0.0.1`. Never reachable from the LAN.
- Every state-changing request needs an `Origin` matching the host **and** an
  `X-Reporto-Write: 1` header. A cross-origin "simple" POST can set neither, which is what
  stops a page you happen to have open from triggering a pull.
- `GET` endpoints are unguarded — they only read local files.
- Tokens live in `.env`, are never returned by any endpoint, and never reach the browser.
- The write APIs exist only in dev mode.

## Why it stays local

Report generation runs as *me*. That is why it needs no integration work, and exactly why it
does not generalise:

1. **The credentials are mine** — my `gh` keyring auth, my Jira token, my Slack token. Serving
   other people means real per-user OAuth for four providers.
2. **Storage is global** — static files any page load can fetch, with no notion of who asks.
3. **There is no server and no auth.** The API only exists in dev mode.
4. **Job execution is one in-memory lock.** Fine for one person.

If teammates want this, they clone it and run their own copy against their own logins — N
private instances, no auth layer to build. If they only want to *see* the output, publish
read-only snapshots.

## More

- [docs/setup.md](docs/setup.md) — credentials, config keys, the status vocabulary, and the
  pre-push scan that keeps confidential words out of a public remote.
- [docs/notes.md](docs/notes.md) — how each page works and why, including the parts where the
  obvious approach turned out to be wrong. Written while building, so it reads as a log.

MUI supplies the accordions, checkboxes and icon buttons; everything else is plain CSS with
light/dark tokens in `src/index.css`. Charts are Recharts, taking their colours from CSS custom
properties so every palette and dark mode work without re-rendering.

`@rolldown/binding-darwin-arm64` is pinned as a devDependency to work around npm skipping the
optional native binding ([npm/cli#4828]) — removable once a later npm installs it reliably.

[npm/cli#4828]: https://github.com/npm/cli/issues/4828
