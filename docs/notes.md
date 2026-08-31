# How reporto works, and why

The README says what this is and how to run it. This is the long version: what each page does,
and the reasoning behind the parts where the obvious approach turned out to be wrong.

Most of it was written while the thing was being built, so it reads as a log rather than as
documentation — which is the point. The *why* is the part that is expensive to rediscover.

- [The Jira board](#the-jira-board)
- [Open PRs, by who is holding the ball](#open-prs-by-who-is-holding-the-ball)
- [What the PR list shows](#what-the-pr-list-shows)
- [The review queue](#the-review-queue)
- [Slack mentions](#slack-mentions)
- [Ticket aging](#ticket-aging)
- [The stand-up note](#the-stand-up-note)
- [Monthly statistics](#monthly-statistics)
- [The project map](#the-project-map)
- [Commands and skills](#commands-and-skills)
- [⌘K](#k)
- [Update buttons](#update-buttons)
- [PR actions](#pr-actions)
- [Changing a ticket's status](#changing-a-tickets-status)
- [The Jira pull, in two passes](#the-jira-pull-in-two-passes)
- [Keeping the page current](#keeping-the-page-current)
- [Keeping it current without pressing anything](#keeping-it-current-without-pressing-anything)
- [Palettes](#palettes)
- [Look and charts](#look-and-charts)
- [Layout](#layout)

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

## "Not today" on the queue

The queue had no triage. A row you have looked at, decided about and cannot act on yet — a PR
waiting on somebody's holiday, a ticket blocked on a contract — kept shouting every morning
until the state behind it changed, and the honest response of ignoring it teaches you to ignore
the panel. So a row can be snoozed.

Deliberately weak, in three ways:

- **Until tomorrow, never longer.** It hides a row for one morning rather than letting me bury
  something for a week.
- **The count does not move.** The KPI strip and the panel head keep the true total; only the
  list shortens, and the line underneath says how many are held back and shows them again. A
  number that quietly shrinks when a row is dismissed is exactly the failure this dashboard
  exists to prevent.
- **Local, in `localStorage`**, next to the palette and the activity read mark — the dates are
  local calendar dates, because `toISOString().slice(0, 10)` on local midnight is yesterday at
  a positive offset, which would wake every snooze the moment it was set.

## Unread activity on the Jira page

Above the board: comments other people left on my tickets, and which of them I have not read.

Jira's own bell is not available to this app. The feed behind it lives on a gateway route —
`/gateway/api/notification-log/api/2/notifications` — that answers **404 to API-token auth**;
it only works with a browser session cookie. So there is no notification list to fetch and no
read flag to read or write back.

What is reachable is the comments and the changelog. The full pull reads, for each of the
first forty board tickets and four requests in flight, the last five comments and the whole
changelog; it keeps what somebody else wrote or did inside the configured window, and flattens
each comment body to a one-line excerpt. A comment that tags me is marked by **accountId,
never by display name** — two colleagues here share a first name, and a name match would put
someone else's mention in my queue. Being **assigned** a ticket counts as a mention for the
same reason, matched the same way.

Comments alone were not enough, and the measurement is why: on this board, other people had
written one comment across eight tickets, 672 days old — while the changelog showed 108
entries by other people across twelve tickets. Nobody comments here; tickets get moved and
reassigned. So the changelog is the half that actually fires.

Two things follow from that. **Fields are a whitelist**, because a board also generates
description edits, summary rewordings and backlog rank churn, and a queue carrying those is a
queue nobody reads — universal Jira field names in code, the board's own custom ones in
`activityFields` in config, for the same reason the status vocabulary lives there. And **the
window is config** (`activityDays`), because a fortnight is right for a busy board and shows a
misleading nothing on a slow one; the pull writes the number it used into the report, so the
panel's wording cannot drift from the fetch.

One changelog read now serves two answers — time-in-status for the aged tickets and "who moved
this" for all of them — where those used to be separate requests. Aged tickets are scanned
first, so a board longer than the forty-ticket cap still measures the columns somebody is
waiting on.

Read state is therefore ours, in `localStorage`: a `seenAt` instant plus the ids dismissed out
of order. Two details that are not obvious:

- **"Mark all read" stores the newest item's own timestamp, not `Date.now()`.** A comment
  written an hour ago that this pull has not fetched yet would otherwise arrive already read.
- The mark **never moves backwards**, so opening a stale report cannot un-read anything.

An empty list has three causes that look identical and mean opposite things, so the panel says
which: *not fetched* (an old report, or only the fast phase ran), *nobody has touched them
inside the window*, and *all read* — the last one with the time the mark was set, and the **All**
filter to see them again. The same reasoning covers the scan's edges: tickets past the
forty-ticket cap, and tickets whose comments would not load, are counted in the panel head
rather than passed off as silence.

Opening a row opens the ticket drawer, which is where a comment can actually be read, and
marks that one read. The tick marks it read without opening it, for the ones the excerpt
already answered.

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

## What the PR list shows

Each row carries one split pill: review state on the left, deploy-qc state on the right,
each in its own colour.

GitHub's `reviewDecision` collapses "nobody has looked yet" and "somebody commented and I
have pushed since" into states that read identically in a list, so `src/prState.ts` derives
the difference instead:

| State | Meaning |
|---|---|
| `awaiting review` | nobody but me has reviewed — waiting on a reviewer |
| `commented` | reviewed, no work since — waiting on me |
| `awaiting re-review` | reviewed, and real work landed after — waiting on a reviewer again |
| `approved` / `changes requested` | GitHub's own verdicts, kept as they are |

`commented` counts as waiting on me, so it is excluded from the "awaiting review" count and
from the copy-links nudge button.

"Work" is the distinction that matters in the third row. A merge commit is the base branch
being pulled in — the *Update branch* button, or whatever keeps the branch current — and it
gives a reviewer nothing to re-read, so it does not flip the state and does not move the PR
out of the lane that needs me. On one recently merged PR here, five commits landed after the
review and three of them were merges. The row says as much: *reviewed — your move (a
base-branch merge since is not a re-review)*, and where somebody else pushed to my branch it
names them instead of saying "you".

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

## The review queue

`/reviews` answers two questions GitHub does not: **have I looked at this**, and **has
anything happened since I did**. Its own "review requested" list drops a PR the moment a
review is submitted, so the case most worth seeing — you approved, then the author pushed
three more commits — is exactly the one it hides. That gets the top lane here.

PRs in **archived** repositories are dropped: an archived repo is read-only, so its PRs can
never be merged — they are history, not a queue, and one opened three years ago sat at the
top of the list until it was excluded. The open-PR report drops them for the same reason.

The report is two searches: `review-requested:<me>` and `reviewed-by:<me>` on open PRs.
Neither is enough alone, and per PR it works out my latest review, what landed after it and
who put it there, and how many of my own comments nobody has answered.

"Pushed since your review" is not one thing. A merge commit is the base branch being pulled
in — the *Update branch* button, or whatever keeps branches current — and re-reading a PR
because master moved is a waste of the one lane meant to be urgent. So only commits with a
single parent count as work, the row names their author (`@author pushed 2 commits`),
and a PR whose sole push was a merge stays where it was, saying so: *still the author's
move (only a base-branch merge by @x since)*.

Thread *resolution* is not the test. Reviewers here rarely click resolve, so a count of
unresolved threads is a count of every comment ever written and never falls — and most of
them are the review bot's. A thread counts as unanswered when I opened it, mine is still the
last word in it, and the hunk it hangs on has not been pushed over; being unresolved is a
fourth condition rather than the only one, so it can only ever drop work that is
demonstrably finished.

| Lane | What it means |
|---|---|
| **Changed since you looked** | somebody pushed real work after your review, and the row names them |
| **Never looked at** | requested of you, no review from you yet |
| **Your comments unanswered** | you asked, and nobody has replied or pushed over it |
| **You approved** | still open, waiting on somebody else |
| **Reviewed, nothing new** | nothing has moved since |
| **Automation** | dependency bumps, collapsed behind a toggle so they never compete with a colleague |

Each row carries the author, the linked ticket and its Jira status, and a size chip — files
plus lines added and removed, toned so a one-line fix and a forty-file refactor do not look
alike, because that is what decides whether a review fits in the gap before your next
meeting.

Two ages, deliberately kept apart: the pill is how long the **branch** has been still, while
"waiting N days" is how long the **PR** has existed. On an abandoned branch they differ by
years, and conflating them made a three-year-old PR read as though the request arrived
yesterday.

## Slack mentions

A fifth report: who named you, and whether the last word is still theirs. Slack's own answer
to that — unread badges — is useless, because unread clears the moment a channel is glanced
at on a phone, and a question somebody is waiting on then reads as handled. So "waiting" is
derived from the conversation instead.

Deciding it takes two endpoints, not one, because a reply lands in one of two places:

- `conversations.replies` sees a reply **inside the thread**. Search results do not carry
  `thread_ts`, so whether a mention is threaded at all is not knowable until asked — a single
  message comes back as a thread of one, and that is the signal to ask the channel instead.
- `conversations.history` from the mention's timestamp sees a reply **in the channel below
  it**, which is how half of Slack actually answers. Without this every such exchange sat in
  "waiting on you" forever, which is the exact false alarm the page exists to remove.

Mentions come from one `search.messages` call rather than a walk over channels, which is what
makes the pull about a second. Search is a paid-plan feature; a free workspace answers
`not_allowed_token_type`, and that error is left to surface rather than degrading into a
partial answer that looks complete.

Direct messages come from the same search (`is:dm`), not from a call per conversation: there
are far more DM conversations than channels, and `conversations.history` for each would be
minutes of rate-limited requests. A DM has one timeline, so its newest message *is* the last
word and who wrote it is the whole answer. Search returns the counterpart's *user id* as the
DM's channel name, so that gets resolved against the user list — a row reading `@U04…`, a
bare member id, names nobody.

Lanes put age above kind: an unanswered DM from three weeks ago belongs with the other things
being carried, not at the top of today's list.

Auth is a **user token** (`xoxp`), so what it reads is what you can read and anything it
posts is your own message. A bot token cannot see your mentions at all.

### Replying from the queue

Each row offers a reply and a ✅. Both post **as you**, in a shared workspace, with no undo,
so the design is deliberately narrow:

- The request carries the **row id**, never a channel. The server looks that id up in the
  report it holds and refuses anything that is not in it, which makes the report the
  allow-list: the dashboard can answer where you were addressed and nowhere else.
- A reply goes **into the thread** when the message is in one, and into the channel when it is
  not — the same distinction the queue uses to decide who is waiting.
- The composer states the destination in words before you send, ⌘↵ sends and bare Enter does
  not, and nothing is ever composed or sent without a person pressing the button.
- An answered row moves to *You replied* immediately, without waiting for the next pull. A row
  still saying "waiting on you" after you have just answered it is the same lie the unread
  badge tells.

### Flow checks against Slack

The Jira/GitHub checks gained three that need Slack, and none of them needs to know your
channel conventions — they key off what a message *names*, read from the full text at pull
time rather than from the 160-character excerpt:

| Check | Why it is a contradiction |
|---|---|
| A ticket **in flight** was asked about and nobody answered | The board says the work is moving; a question about it has sat in a channel for days. Neither side knows the other exists. |
| A ticket **already shipped** was asked about, unanswered | The board moved and nobody said so in the channel. Usually a one-line reply. |
| A PR **shared in a channel** is not on `deploy-qc` | Sharing a link reads as "ready to look at", and whoever opens it will read code QC cannot test. |

The first two require the last word to be somebody else's; the third deliberately does not,
because the commonest case is sharing your own PR, where the last word is yours by definition.
Bots are excluded from all three — a deploy feed posts links all day.

### Posting the stand-up note

The stand-up card grows a **Post to Slack** button, and only when
`slackStandupChannel` is set in `config/reporto.json` — with no channel configured there is
nothing to post to and no button, rather than a picker inviting a wrong guess.

The destination never comes from the browser: the request carries the note's text and nothing
else, and the server resolves the configured name to a channel id, refusing one you are not a
member of. Posting takes two clicks — the first only reveals where it would go, spelled out
("Post to #standup as you?") — because a stand-up in the wrong channel is not something an
undo fixes.

`SLACK_USER_TOKEN` is read through the same helper the pullers use, which checks `.env` on
disk as well as the environment: the dev server lifts `.env` at boot, so a token pasted by
hand afterwards would otherwise leave Settings saying "configured" while every pull failed.

## Ticket aging

The PR lanes have said "no review yet — 6 days, chase it" for a while. Tickets had no
equivalent: the board looked identical on day one and day seven of a review column, so work
could rot in a status nobody owns.

Time-in-status is only in the changelog, and the search endpoint refuses
`expand: ["changelog"]`, so it costs one request per ticket. That is why **only the statuses
named in `statusAging` are measured** — a backlog item's age says nothing, and forty requests
per pull would earn a 429. A ticket that never transitioned falls back to when it was created.

Limits are per status because a fixed number would cry wolf: a QA queue is meant to wait on
somebody else, a review column is not. They live in `config/reporto.json`, along with the rest
of the board's vocabulary — see [Status vocabulary](setup.md#status-vocabulary). Past the limit a card grows a pill; past
twice the limit the pill turns red — one needs a nudge, the other needs a decision.

Days are derived when the page renders, never stored: a report read tomorrow must not still
claim "2 days". The stand-up note lists the overdue ones under blockers, excluding tickets
already flagged BLOCKED so nothing is said twice.

## The stand-up note

The dashboard builds it on demand: what moved since the last working day (Monday looks back
to Friday), what is in flight, what is stuck, and what the calendar takes today. The first
half is a Jira search plus a changelog read per ticket and one GitHub search — behind a
button, because it is wanted once a day rather than on every visit. The rest is derived from
the reports already on disk. **Copy note** puts it on the clipboard as plain text.

On Hold is deliberately not a blocker: parked work read out every morning is what makes
people stop listening to that part of the note.

## Monthly statistics

`/stats` answers "what did last month look like" from the APIs, not from the daily report
files. Those files are day snapshots with gaps — weekends, days off, any day a pull did not
run — so diffing them would invent ticket transitions that never happened and miss the ones
that happened twice between two snapshots.

| Metric | Where it comes from |
|---|---|
| Shipped, ready to release, sent back, created | Jira JQL `status changed to "<status>" DURING (month)` for tickets assigned to me. Which status each one counts is `statsStatuses` in config — see [Status vocabulary](setup.md#status-vocabulary) |
| Cycle time | per-ticket changelog: last `In Progress` before the ticket reached the configured release status |
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
- **One diagram per system** — a layered diagram each, drawn as inline SVG. Not a
  diagramming dependency and not a force layout: the layer of every node is stated rather
  than solved, because a diagram you read every day must not rearrange itself between
  renders. An edge naming a node that is not on the map is dropped rather than drawn to
  nowhere.

### Architecture, and a project's own diagrams

A project can also carry an **architecture briefing** — packages, runtime processes, where
state lives, the conventions that bite — and **its own diagrams**, which is where a domain
model goes. Same layered renderer as the infrastructure view, so an entity map is layers of
aggregates with foreign keys as edges. Past two sections the page grows a jump list, because
the largest project's briefing runs to nine of them.

Every fact carries the file, table or symbol it came from, so it can be checked rather than
believed — and the ones worth having are the ones nobody writes down: a dead worker process
that still runs, a generated column that cannot be written, a CI job that only fires when its
own paths change so a green run can mean it never executed.

A domain model runs to dozens of edges, and following one entity through that by eye is
hopeless, so **hovering an entity dims everything it does not touch**. Nothing is hidden,
only quietened. Each diagram can also carry `notes`: the rules a picture cannot hold — a
generated column, an XOR check constraint, what a missing tenant context returns.

### Flows

A project page draws the paths through it worth knowing — sign-in, a hand-off to a payment
provider, a listing going live — as lanes and ordered steps: each step sits in the lane of
whatever performs it, so a hand-off is a crossing you can count. Elbow connectors rather
than curves, because between two lanes a right angle says "the same step moved sideways"
where a bezier suggests something smoother than a network call.

Every flow carries **where it was read from** (`web/src/checkout/session.ts`) so a reader can
check it instead of trusting it, and `verified: false` renders as a chip until somebody has
confirmed it against the running system. That distinction matters more than it looks: a
diagram read out of code is a claim about the code, not about production.

**Separate systems get separate diagrams.** One stack of layers with everything in it
quietly claims they share those layers, and that claim was wrong the first time this was
drawn: a product that has its own client, API server, CMS and database had been drawn hanging
off the shared backend. Now each system is its own entry with its own layers, so a
cross-system edge is impossible by construction rather than by discipline.

Rows the app cannot verify are labelled a **sketch** on the page — deployment topology is not
documented anywhere it can read, so it is seeded from what the local docs state and meant to
be corrected by hand.

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

## Update buttons

Every card can be refreshed from the dashboard.

| Report | How it refreshes |
|---|---|
| `prs` | `POST /api/pull/prs` — one GitHub GraphQL call, about a second (circular-arrow icon) |
| `jira` | `POST /api/pull/jira` — one Jira search plus one GitHub search (circular-arrow icon) |
| `calendar` | `POST /api/pull/calendar` — Google Calendar API (circular-arrow icon) |
| `reviews` | `POST /api/pull/reviews` — two GitHub searches, about a second (circular-arrow icon) |
| `stats` | `POST /api/pull/stats` — Jira, GitHub and Calendar for six months (circular-arrow icon) |

The calendar covers **Google only**, and the report says exactly what Google said.

It used to merge: every event whose `source` was not `google` was carried over from the previous
report, so that a pull could not delete the Outlook meetings no server can read — an Outlook
calendar needs a logged-in browser. The failure mode turned out worse than the problem. Once
nothing was writing those events any more, the merge kept re-copying one stale recurring meeting
into every report, and a calendar that claims a meeting nobody has verified in a week is worse
than one that admits it only knows Google.

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

## The Jira pull, in two passes

The search is fast — one request, and it carries everything the board draws: key, summary,
status. Everything *after* it is slow: a GitHub search to match PRs onto tickets, and a
changelog read per aged ticket. Waiting for those before writing anything meant twenty seconds
of an empty page for data that was ready in one and a half.

So the pull has two phases and the client runs both:

1. `POST /api/pull/jira?phase=fast` — the search alone, written immediately and marked
   `partial` with a `pending` list of what is missing. **~1.5s.**
2. `POST /api/pull/jira` — the whole thing, overwriting it. **~15s.**

The board is therefore on screen while the rest fills in behind it, and the spinner stays on
until both are done because the data is not complete until then. `npm run pull` from cron does
the full pass only: nobody is watching, so a partial write would be noise.

Where a fact is still coming, the card shows a **skeleton rather than an empty space** —
"empty" and "not loaded" look identical, and a card with no PR chip means "no PR on this
ticket", which is something the flow checks act on. Only cards that could plausibly have one
get a placeholder; a backlog item with no PR is not a gap. And the shimmer stops when nothing
is in flight: on a partial report with no pull running — it failed, or the page was just
opened — the placeholder holds still and the header says *not fetched* rather than *loading*.

## Keeping the page current

Nothing polls on a timer. Push is not available here for four of the five sources — GitHub and
Jira webhooks need a public URL, Google Calendar needs a verified HTTPS callback, and this
server is loopback-only on purpose — so the trigger is **attention** instead: on load, on
navigation, and when the window regains focus, the reports the current route shows are
refetched if they are past their own age limit.

| Report | Stays believable for | Why |
|---|---|---|
| Slack | 5 min | Somebody waiting on a reply is the most time-sensitive thing here |
| PRs, reviews | 10 min | Review state changes in minutes |
| Jira | 30 min | A board moves a few times a day |
| Calendar | 2 h | Today's meetings rarely move |
| Statistics | 1 day | Monthly counts, and the most expensive pull |

A page showing no report — Settings, Commands — fetches nothing. Kinds run one at a time, and
a per-kind minimum gap means a window that flaps focus cannot turn into a burst of pulls. The
whole thing is one checkbox in Settings, which also lists those limits so the behaviour is not
a mystery.

Slack *could* push, over Socket Mode with an app-level token and no public URL. It needs a bot
user and event subscriptions the app does not have, and a WebSocket held open in the dev
server. Not worth it until the mention queue starts feeling late.

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

## Layout

```
src/
├── App.tsx            report loading, routing, the shell
├── types.ts           report schemas — the contract with whatever writes them
├── reportSchema.ts    runtime shape guards, because agents write these files
├── statusVocab.ts     the board's status vocabulary, from config
├── needsYou.ts        the dashboard queue and its counts
├── flowChecks.ts      contradictions between Jira and GitHub
├── prState.ts         PR review state, and the deploy-qc chip
├── prLanes.ts         which lane a PR is in, its reason line, its aging tone
├── reviewLanes.ts     the same for the review queue, plus size tones
├── slackLanes.ts      the same for Slack rows
├── ticketAging.ts     days in status, and what counts as stuck
├── standupNote.ts     the stand-up note, assembled from what already exists
├── statsMetrics.ts    monthly metric definitions, deltas and formatting
├── paletteItems.ts    what ⌘K offers, and how a query is scored
├── freshness.ts       per-report staleness ceilings
├── projectMap.ts      the project pages, and the diagram layout maths
├── pages/             one file per route
├── components/        cards, charts, chips, the drawer, the shell
└── stories/           Storybook stories + the invented-marketplace fixtures

server/                the pullers, and the only code that talks to an API
├── reports.mjs        config, the pullers, and the report + index writing they share
├── jira.mjs           Jira REST: the board, transitions, one issue in full
├── github.mjs         open PRs, the review queue, deploy-qc comparison, PR actions
├── slack.mjs          mentions, DMs, replies and reactions
├── googleCalendar.mjs today and the week ahead
├── stats.mjs          six months of Jira transitions, PR timings, meeting hours
├── standup.mjs        what moved since the last working day
├── capabilities.mjs   which modules are configured, and secret writes
└── kit.mjs            the commands and skills installed on this machine

scripts/
├── pull.mjs           headless pull, for cron
├── shots.mjs          re-shoot the README screenshots from Storybook
├── nda-scan.mjs       the pre-push confidential-word scan
└── google-auth.mjs    one-time OAuth consent → refresh token in .env

vite.config.ts         the dev-server APIs and the cross-site guard
vitest.config.ts       tests — its own file, so the dev-server plugins stay out
.storybook/            Storybook config; preview stubs the router, refresh and capabilities
config.template/       committed template to copy to config/
public/reports/        report JSON + index.json (gitignored)
docs/                  the screenshots, and these notes
```
