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
| `githubOrg` | GitHub org whose repos the `/jira` refresh may query. Leave empty and the refresh runs without the `gh api repos/<org>/*` permission, so the deploy-branch check will fail. |
| `commandGroups[].command` | Claude Code slash command that regenerates reports. |
| `commandGroups[].writes` | Report kinds that command produces (`email`, `calendar`, `jira`, `prs`). Both kinds refresh together when either card's button is pressed. |
| `commandGroups[].tools` | Which allow-list the headless run gets: `mail` (Chrome MCP, for reading inboxes and calendars) or `jira` (Atlassian search plus specific `gh` commands). The lists themselves live in `vite.config.ts`. |

Without a `config/` directory the dev server falls back to this template, which means
update buttons still run but the Jira deploy-branch check lacks permission.
