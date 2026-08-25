# config template

Copy this directory once, then edit your copy:

```bash
cp -r config.template config
```

`config/` is gitignored — it holds the details that are yours alone, so the repository
stays free of employer or account specifics.

## `reporto.json`

| Key | Meaning |
|---|---|
| `githubOrg` | GitHub org to search for your PRs. |
| `githubAuthor` | GitHub login whose PRs the dashboard reports on. |
| `githubAccount` | `gh` keyring account to pin. Org repos 404 under the wrong active account, so this is worth setting even when it equals `githubAuthor`. |
| `pinnedRepos` | Repo names sorted to the top of the open-PR list, in the order given. Everything else follows busiest-first. |
| `jiraSite` | Jira site root, e.g. `https://your-site.atlassian.net`. Required for the Jira pull. |
| `jiraBrowseUrl` | Base for ticket links. Defaults to `<jiraSite>/browse`. |
| `jiraJql` | Which tickets the dashboard shows. Defaults to everything assigned to you that is not Done, freshest first. |
| `ticketPattern` | Regex source matching a ticket key in a PR title, e.g. `\bPROJ-\d+\b`. How PRs get attached to tickets. |
| `fallbackStatuses` | Statuses where a ticket with no title match is worth one body search of your own PRs. Defaults to in progress / code review / qc ready / blocked — backlog items are not worth the rate limit. |
| `calendarIds` | Calendar addresses to read, e.g. `you@example.com` or `…@group.calendar.google.com` (Calendar settings → Integrate calendar → Calendar ID). Required with a service account, which cannot enumerate calendars. |
| `calendars` | Calendar names to pull. Empty means every calendar the Google account can read. |
| `calendarsExcluded` | Calendar names to skip — birthdays, holidays, task lists. |
| `statusChoices` | Statuses offered when changing a ticket from the dashboard, matched against a transition's target status. Empty means Jira's whole workflow, which is usually far more than anyone moves a ticket to by hand. |
| `upcomingDays` | How far the calendar watch-list looks ahead. Defaults to 7. |
| `commandGroups[].command` | Claude Code slash command that regenerates reports, spawned as `claude -p`. Only needed for reports the server cannot pull itself — the Outlook half of the calendar, which requires the Chrome extension. Leave the list empty if you run `/email` by hand. |
| `commandGroups[].writes` | Report kinds that command produces (`calendar`, `jira`, `prs`). Kinds in one group refresh together. |
| `commandGroups[].tools` | Which allow-list the headless run gets: `mail` (Chrome MCP, for the calendar skill) or `jira` (Atlassian search plus specific `gh` commands). The lists live in `vite.config.ts`. |

Jira credentials are **not** in this file — they are secrets. Copy `.env.example` to `.env`
and put `JIRA_EMAIL` / `JIRA_API_TOKEN` there.

Without a `config/` directory the dev server falls back to this template, so it boots, but
the pulls query a placeholder org and site and return nothing useful.
