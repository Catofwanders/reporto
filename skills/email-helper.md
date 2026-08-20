# /email helper (token-lean)

Chrome extension (`mcp__claude-in-chrome__*`) required — if tools are deferred, ONE
ToolSearch: select `tabs_context_mcp`, `navigate`, `computer`, `get_page_text`,
`read_page`, `tabs_create_mcp`, `tabs_close_mcp`. If the extension is not connected, tell
the user to run `/chrome` or restart the session — do not fall back to Playwright.

## Accounts / URLs — fill these in

| What | Value |
|---|---|
| Inbox A (webmail URL) | `<https://mail.example.com/...>` — `<you@example.com>` |
| Inbox B (webmail URL) | `<https://outlook.office.com/mail/>` — `<you@employer.com>` |
| Calendar A | `<https://calendar.example.com/.../day>` |
| Calendar B | `<https://outlook.office.com/calendar/view/day>` |
| Ticket key regex | `<PROJ>-[0-9]+` |
| Dashboard reports dir | `<path to>/reporto/public/reports` |

Keep the real values here, in your own copy. This file is the only place they belong —
not in the repo, not in the report.

## Reading flow (cheapest first)

1. `tabs_context_mcp {createIfEmpty:true}` → navigate a **new** tab to inbox A.
2. `get_page_text` on a webmail list view is often nearly empty (dynamic render) — use
   `computer {action:"screenshot"}` for the list; senders, subjects and times are legible there.
3. Open individual mails ONLY for items that pass the filter and need body detail
   (click the row → `get_page_text` works on the opened mail).
4. Navigate the same tab to inbox B, `wait 3`–`6` (slow SPAs), screenshot. Read every tab
   the inbox splits mail across.
5. Close the tab when done (`tabs_close_mcp`). A tab that dies mid-run invalidates its id:
   call `tabs_context_mcp` again rather than retrying the old one.

## Filter

INCLUDE:
- A human pinged or mentioned me — review requested, @mention, comment addressed to me,
  assignment. Extract who, where (`repo#PR` / ticket key), and what they want.
- Personal mail from a real person, especially with an attachment.
- Trainings, compliance, HR or policy mail requiring MY action — carry the deadline.
- Requests completed for me: accounts, hardware, licences.
- Automation that asks me for a step ("approved — now merge and set status X").

EXCLUDE: CI and pipeline failures, bot comments, approval-only notices, merged/closed
notices, newsletters, townhalls and org announcements, calendar spam and past cancelled
events. A future event cancelled with an organiser note may still matter.

Unsure? A human wrote text addressed to me = include. Pure state-change = exclude.

## Report contract — the only output

The dashboard is the renderer, so a run produces JSON and nothing else: no HTML report, no
side file. Write both into the reports dir and bump the index, or the dashboard shows
nothing:

- `email-<YYYY-MM-DD>.json` → `EmailReport` in `src/types.ts`
- `calendar-<YYYY-MM-DD>.json` → `CalendarReport`
- `index.json` → set `latest.email` / `latest.calendar` **and** the `history[]` entry for
  that date

Per item: `chip` is `bad` = action required, `warn` = ping/review, `ok` = info, `na` = FYI,
and `action` is an imperative with a deadline when something is needed from me ("Reply
about X by Friday") or `null` when nothing is. `refLabel`/`refUrl` carry the PR or ticket
the item is about; `mailUrl` is the source link, which every item needs.

Stamp `generatedAt` with the real run time (`date -u +%FT%TZ`) — the action bar derives
"x ago" from it. Event `start`/`end` need a full ISO 8601 string with offset
(`2026-08-20T11:00:00+03:00`); a bare `"11:00"` renders as `Invalid Date`. All-day items
use `null` and carry their dates in `note`.

## Calendar (part of an /email run)

Read TODAY from **both** calendars — neither alone is complete, and skipping one silently
loses recurring meetings that live only there. Day view for today, then week view
(`get_page_text`) for the rest of the week's recurrences and for who is on leave.

Collect meetings, kickoffs and activities, plus all-day items (leave = who is out). Put
today's in `events`, and anything worth watching later — rescheduled meetings from mail,
upcoming leave of people blocking you — in `upcoming`.

Join links: a week view often prints the conferencing URL inline in `get_page_text`, which
is the cheapest way to get one. The extension blocks reading hrefs and ids carrying base64
or query-string data, so some join URLs are unreachable; fall back to the event permalink
from the URL bar, or a day-view URL (`.../day/YYYY/M/D`). Every event needs some `url`.
