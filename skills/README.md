# skills

Most of the dashboard comes from the server, straight from an API, with no agent involved:
`prs` from `server/github.mjs`, `jira` from `server/jira.mjs`, and the Google half of
`calendar` from `server/googleCalendar.mjs`. Nothing to install, nothing to prompt.

Mail is the exception, and so is any calendar without an API — both are read through the
Chrome extension, which attaches only to an interactive Claude Code session. That work
needs a skill, and this directory is the sanitized copy of it.

Where the two overlap — the calendar report — each side keeps the other's events instead of
overwriting the file: the server's pull preserves non-Google events, and the skill preserves
the Google ones.

```bash
cp skills/email.md        ~/.claude/commands/email.md
cp skills/email-helper.md ~/.claude/docs/email-helper.md
# then fill in the Accounts table in email-helper.md
```

Placeholders stand where the accounts go; your filled-in copies live outside the repo
(`.claude/` is gitignored, deliberately — an agent kit tuned to one person is not
publishable).

| File | What it is |
|---|---|
| `email.md` | the `/email` slash command — triages both inboxes and both calendars |
| `email-helper.md` | constants, reading flow, filter rules, and the report contract |

## The contract

Output is JSON only — the dashboard is the renderer. Whatever writes a report must satisfy
three things, or it is ignored:

1. **Shape** — match the interface in [`src/types.ts`](../src/types.ts). A mail run writes
   `EmailReport` and `CalendarReport`. That file is the schema of record;
   `src/reportSchema.ts` guards what gets loaded.
2. **Filename** — `public/reports/<kind>-<YYYY-MM-DD>.json`.
3. **Index** — add the file to `public/reports/index.json` under both `latest.<kind>` and
   the matching `history[]` entry for that date. A report the index does not name is not
   read.

`generatedAt` must be the real run time (`date -u +%FT%TZ`); the action bar derives its
"x ago" from it. Timestamps inside a `CalendarReport` need a full ISO 8601 string with
offset — a bare `"11:00"` parses to `Invalid Date` and renders as such.
