# Tech debt

Known, accepted, and not worth fixing today. Each entry says what is wrong, what it costs
right now, and what fixing it would take — so the decision to leave it can be re-made rather
than re-discovered.

## One JavaScript bundle, 925KB raw / 283KB gzip

`npm run build` warns, and the warning is right: Recharts is the bulk of it and only the
statistics page uses it, so every visit to the dashboard pays for charts it does not draw.

**Cost today:** none that is felt. This is a local dev-server app on a fast disk; the bundle
is read from `localhost` and cached. It would matter the moment this were served over a
network, which the security model says it never will be.

**Fix:** lazy-load the statistics route — `React.lazy` around `StatsPage`, a `Suspense`
fallback, and Recharts follows it into its own chunk. Half an hour, and the only risk is the
chart's CSS custom properties resolving a frame later than the page.

## The README screenshots lag the dashboard

`docs/home.jpg` and `docs/home-nord.jpg` were re-shot when the dashboard became modules, and
have since fallen behind again: they predate the Slack module, the ticket-aging pills and the
paired top row of flow checks and calendar.

**Cost today:** a reader sees a slightly older product than the one described two paragraphs
below the image. Nothing is wrong, only stale.

**Fix:** run Storybook, open `Pages/Home`, shoot both palettes, replace the two files. Ten
minutes — but it needs doing after *every* visible dashboard change, which is why it keeps
lagging. Worth automating with a Playwright script against the story if it drifts again.

## The Jira pull reads a changelog per aged ticket

Time-in-status is only in the changelog and the search endpoint refuses
`expand: ["changelog"]`, so each status named in `statusAging` costs one request per ticket —
about twenty seconds for six tickets here, against two seconds before.

**Cost today:** paid in the background by the two-phase pull: the board is on screen from the
fast query while these fill in behind it.

**Fix:** modest concurrency (four at a time) would cut the wall clock by roughly that factor,
at the price of a 429 risk on a shared token. Worth doing only if the fill-in phase starts
feeling slow in use.
