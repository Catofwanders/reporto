# Feature requests

Ideas not yet built. Each entry states what it should do, how it would likely work, and
what has to be settled first.

## 1. Change a Jira ticket's status from the dashboard

Move a ticket between statuses (for example `CODE REVIEW` → `QC READY`) without leaving
the dashboard. Today the Jira card is read-only; every transition means opening the
ticket in a browser.

**Shape**

- A status control on each row of the active-ticket list, offering only the transitions
  Jira actually allows for that ticket.
- The allowed transitions come from Jira, not a hardcoded list — statuses and workflows
  differ per project and change over time.
- After a successful transition, refresh only that ticket rather than re-running the
  whole report.

**Mechanics**

The Atlassian MCP already exposes what is needed: `getTransitionsForJiraIssue` to list
the legal moves and `transitionJiraIssue` to apply one. Both are read/write against a
live board, so this cannot be a static-page feature: it needs a dev-server endpoint in
the same shape as `/api/refresh`, with the cross-site guard applied.

**Open questions**

- Is a single transition enough, or does the workflow need a comment or field update at
  the same time (some transitions require fields)?
- What happens when a transition fails validation — surface Jira's message inline on the
  row, presumably.
- Optimistic update or wait for Jira to confirm? Given how slow the round trip is,
  optimistic with rollback (the pattern already used for mail todos) is probably right.

## 2. Merge a selected PR into `deploy-qc`

Put an approved PR's branch onto `deploy-qc` so it lands in the QC environment, chosen
from the open-PR list.

**Shape**

- A per-PR action in the open-PR list, enabled only for PRs that are approved and not
  already in `deploy-qc` — the dashboard already computes both facts.
- After the merge, re-check ancestry so the row immediately reflects the new state.

**Mechanics**

Merging a branch into `deploy-qc` is not the same as merging a PR to `master`, and the
distinction matters:

- `deploy-qc` is periodically hard-reset to `origin/master` and amended, which drops
  QC-only merges. Anything this feature puts there is expected to disappear on the next
  reset — that is normal, and it is exactly why the dashboard checks ancestry instead of
  trusting a PR's merged flag.
- The reset procedure treats console merges to `master` as forbidden. This feature must
  never touch `master`; it targets `deploy-qc` only.

**Constraints before building this**

- **Never automated.** The merge must be triggered by an explicit human click, one PR at
  a time, with the target branch and the PR shown in a confirmation step. No batch
  action, no "merge everything approved", and no agent deciding to run it.
- The confirmation has to name what is being merged where, because the failure mode
  (merging the wrong branch, or into the wrong target) is not silently reversible.
- Decide the merge method — a real merge commit onto `deploy-qc` keeps history honest
  about what QC contains, whereas a squash makes ancestry checks harder to read.

**Open questions**

- Who owns conflicts? If the merge conflicts, the dashboard should refuse and hand the
  user a local command rather than attempting a resolution.
- Should the action be available at all for repos without a `deploy-qc` branch? Those
  exist, and the report already knows which ones.

## 3. Change a PR's status

Act on my own pull requests from the open-PR list instead of opening each one on GitHub.
The list already shows review state and the draft flag, so the state is visible but not
editable.

**Shape**

Only the states the PR's author actually controls:

- Mark a draft ready for review, and convert a PR back to draft.
- Close a PR, and reopen a closed one. The stalest entries in the list are long-dead
  drafts, which is the main thing this would clear out.
- Request reviewers, if that turns out to be the step most often missing after a PR goes
  ready.

Review verdicts stay out of scope: approving or requesting changes belongs to other
people, and GitHub does not allow approving your own PR. Merging is deliberately not
here either — that is request 2, with its own constraints.

**Mechanics**

`gh pr ready`, `gh pr ready --undo`, `gh pr close`, `gh pr reopen`, and
`gh pr edit --add-reviewer` cover all of it, so this reuses the same dev-server endpoint
pattern as the other write actions, behind the cross-site guard. The `gh` allow-list in
`vite.config.ts` currently permits only `gh search prs`, `gh pr view`, and the compare
API, so each new subcommand has to be added there explicitly.

**Constraints**

- Closing a PR is the one action here that discards work in progress, so it needs an
  explicit confirmation naming the repo and PR — and it should stay a single-PR action,
  never a sweep over everything idle.
- Ready-for-review and draft toggles are cheap and reversible; those can act immediately
  with an optimistic row update.

**Open questions**

- After marking ready, should the dashboard also refresh the review state, given the PR
  may immediately pick up required reviewers?
- Is a reviewer picker worth the complexity, or is a link to GitHub enough for that one
  case?
- Should closed PRs stay visible in the list for the rest of the day (so the action is
  undoable in place) or vanish on the next refresh?
