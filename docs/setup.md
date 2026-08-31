# Setting it up

Everything that needs a credential, a config key or a decision from you. The README covers
the two-command version; this is the rest.

## Configuration

```bash
cp -r config.template config     # then edit config/reporto.json
cp .env.example .env             # then add your Jira API token
```

### Status vocabulary

Committed code knows the words every Jira has — *backlog*, *in progress*, *in review*,
*blocked*, *done* — and nothing else. Every stage past those is named in
`config/reporto.json`, which is gitignored:

```jsonc
"statuses": {
  "order":  ["Backlog", "In Progress", "In Review", "Ready for QA", "Ready to ship"],
  "tones":  { "qc": ["Ready for QA"], "ok": ["Ready to ship"] },
  "groups": {
    "active":   ["Ready for QA"],      // still mine, still moving
    "inFlight": [],                    // development itself is not finished
    "blocked":  ["QA rejected"],       // said out loud at stand-up
    "devDone":  ["Ready for QA"],      // dev finished, release has not happened
    "shipped":  ["Ready to ship"]      // out the door
  }
},
"statsStatuses": { "releaseReady": "Ready to ship", "deployed": "Shipped",
                   "qcReady": "Ready for QA", "qcFailed": "QA rejected" }
```

`order` sets the board's columns left to right and replaces the generic order; `tones` and
`groups` merge over the defaults, config winning per status. A status the vocabulary has never
seen keeps the chip the pull wrote for it and sorts after every column that is named.

Two reasons it works this way. The remote is public and a workflow's column names belong to
whoever owns the board — see the NDA rules — and it makes somebody else's workflow a config
edit rather than a patch across seven modules. The trade is that a group left empty means the
checks that need it do not fire: no `devDone` statuses, no "board says done, code says
otherwise" findings. That is the right failure — a guess there would invent contradictions.

`statsStatuses` has no defaults beyond `inProgress`, for the same reason in reverse: a wrong
status name in a `status changed to` clause counts a confident zero, so an unnamed metric
reports as unavailable instead.

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

### Slack

One **user** token, `SLACK_USER_TOKEN`, and nothing else. A user token reads what you can
already read and posts as you — which is the whole design: this replies in your name or not at
all. A bot token (`xoxb-`) cannot see your mentions, and an app-level token (`xapp-`) is not a
Web API token at all. Settings refuses anything that does not start `xoxp-` for exactly that
reason.

**Getting one.** api.slack.com/apps → *Create New App* → *From scratch* → pick your workspace.
Then *OAuth & Permissions* → **User Token Scopes** (the second table, not the bot one):

| Scope | What stops working without it |
|---|---|
| `search:read` | everything — mentions and DMs are both found through `search.messages` |
| `channels:history`, `groups:history` | reading what came after a mention, so every row says "no reply yet" |
| `im:history`, `im:read` | DMs, and resolving whose DM it is |
| `users:read` | names — rows show raw member ids instead |
| `chat:write` | replying from the queue, and posting the stand-up note |
| `reactions:write` | the ✅ shortcut on a row |

*Install to Workspace*, approve, and copy the **User OAuth Token** from the top of that page. It
starts `xoxp-`. Paste it into Settings → Modules → Slack, which writes it to `.env` for you —
or put `SLACK_USER_TOKEN=xoxp-…` in `.env` by hand and restart the dev server, because `.env` is
lifted into the environment at boot.

**Three traps worth knowing**, all of which cost time here once:

- An `xapp-` token answers `auth.test` with `ok: true` and **no `user_id`**, so it looks valid
  and then finds nothing. The missing user is the tell.
- Adding a scope after installing needs a **reinstall** before the token carries it; the old
  token keeps working, minus the new permission, with a `missing_scope` error per call.
- A workspace can require admin approval for app installation. Then this needs an admin, and
  there is no way around it from here.

**Config keys** (`config/reporto.json`, all optional): `slackDays` — how far back to search,
default 14; `slackChannelsExcluded` — channel names whose mentions are noise, like alert feeds;
`slackStandupChannel` — where the stand-up note posts. Leave the last one unset and the Post
button does not appear at all, which is the safe default: nothing can post anywhere until you
name a destination.

## Modules and credentials

Settings → **Modules** lists what this machine can fetch. Each row says whether it is
configured, offers a switch, and takes the credentials it needs:

- A module that is **unconfigured or switched off is hidden** — no sidebar row, no dashboard
  module, no ⌘K entry, no update button — and its page explains which of the two it is rather
  than rendering empty. A card that can never fill reads as a bug.
- The switch is a **config write**, not a browser preference: it lands in
  `config/reporto.json` as `disabledModules`, so `npm run pull` from cron skips it too. The
  pull endpoint refuses a disabled kind, so a stale tab cannot fetch behind the switch.
- Credentials are **write-only**. The server answers "set" or "unset" and never returns a
  value, the field is cleared the moment it saves, and only variables on a fixed list are
  writable. A value is shape-checked first, so a token pasted into the e-mail field fails
  there rather than as a 401 an hour later. Saving again replaces — that is how a rotated
  token gets in without opening an editor.
- Some modules take **either** of two credential routes: Google Calendar is happy with a
  service-account key *or* the installed-app OAuth trio, and the row reports whichever route
  is closest to done.

This endpoint writes secrets to disk, so it exists only in the dev server, behind the same
cross-site guard as the other write APIs — a production build is a static site with no API.

## Before pushing

The remote is public and the work behind these reports is not, so a push is gated on a scan
for confidential words:

```bash
git config core.hooksPath .githooks    # once per clone
node scripts/nda-scan.mjs              # what would be pushed: patch + commit messages
node scripts/nda-scan.mjs --tracked    # every tracked file
```

The scanner carries no terms of its own — it reads them from the gitignored `config/`, plus
an optional `.claude/nda-terms.txt`, because a committed list of the words being hidden is
the leak it exists to prevent. With no terms available it fails rather than passing.

Committed example data — the Storybook fixtures and `config.template/` — is an invented
online marketplace for the same reason: example data shaped like the real projects describes
them even when every name is changed.
