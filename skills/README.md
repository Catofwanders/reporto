# skills

The dashboard renders report files; these skills are what write them. A fresh checkout
starts empty, so without them there is nothing to look at and no way to know what the
JSON is supposed to contain.

These copies are **sanitized templates** — no accounts, URLs, or employer names. Fill in
the placeholders in your own copy. Your working copies live outside this repo (`.claude/`
is gitignored, deliberately: an agent kit tuned to one person is not publishable), so
install them wherever your agent looks for commands:

```bash
cp skills/email.md                  ~/.claude/commands/email.md
cp skills/email-helper.md           ~/.claude/docs/email-helper.md
cp skills/email-report-template.html ~/.claude/docs/email-report-template.html
# then edit the Accounts table in email-helper.md
```

| File | What it is |
|---|---|
| `email.md` | the `/email` slash command — triages both inboxes, then writes the reports |
| `email-helper.md` | the constants, reading flow, filter rules, and report contract it follows |
| `email-report-template.html` | standalone HTML report opened in the browser at the end of a run |

`jira-<date>.json` and `prs-<date>.json` have no skill here. `prs` is pulled by the server
itself (`server/github.mjs`, one GraphQL call) and needs nothing from you. `jira` is
different: it has **no** server-side puller, so the Jira card is entirely dependent on a
`/jira` command your own kit defines and `config/reporto.json` names under
`commandGroups`. None is shipped here because it leans on personal Atlassian and `gh`
auth — so write your own to the contract below, or leave the card empty.

If that command also writes `prs` (mine does), note that a skill-written PR report lacks
`lastReviewAt`, `lastCommitAt` and `deployQc`, so the derived review state falls back to
`reviewDecision` and the deploy-qc half of the pill vanishes until the server pull runs
again.

## The contract

Whatever produces a report must satisfy three things, or the dashboard ignores it:

1. **Shape** — match the interface in [`src/types.ts`](../src/types.ts). `EmailReport` and
   `CalendarReport` are the two a mail skill writes. That file is the schema of record;
   `src/reportSchema.ts` guards what gets loaded.
2. **Filename** — `public/reports/<kind>-<YYYY-MM-DD>.json`.
3. **Index** — add the file to `public/reports/index.json` under both `latest.<kind>` and
   the matching `history[]` entry for that date. A report the index does not name is not
   read.

`generatedAt` must be the real run time (`date -u +%FT%TZ`); the action bar derives its
"x ago" from it. Timestamps inside a `CalendarReport` need a full ISO 8601 string with
offset — a bare `"11:00"` parses to `Invalid Date` and renders as such.
