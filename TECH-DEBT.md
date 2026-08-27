# Tech debt

Known, accepted, and not worth fixing today. Each entry says what is wrong, what it costs
right now, and what fixing it would take — so the decision to leave it can be re-made rather
than re-discovered.

## The main bundle is 550KB raw / 175KB gzip

Recharts is out — the statistics route loads with its own chunk (383KB raw, 111KB gzip), so a
visit that never plots anything no longer pays for the library. What is left in the main chunk
is mostly MUI: the component library plus the icons, and `npm run build` still warns at 500KB.

**Cost today:** none that is felt. This is a local dev-server app reading from `localhost` with
a warm cache. It would matter the moment this were served over a network, which the security
model says it never will be.

**Fix:** the icons are individually imported already, so the remaining win is MUI's components
— few enough here that plain elements plus the existing CSS would replace them, which is a
bigger job than it sounds and buys nothing while this stays local. Leave it.

## The Jira pull reads a changelog per aged ticket

Time-in-status is only in the changelog and the search endpoint refuses
`expand: ["changelog"]`, so each status named in `statusAging` costs one request per ticket —
about twenty seconds for six tickets here, against two seconds before.

**Cost today:** paid in the background by the two-phase pull: the board is on screen from the
fast query while these fill in behind it.

**Fix:** modest concurrency (four at a time) would cut the wall clock by roughly that factor,
at the price of a 429 risk on a shared token. Worth doing only if the fill-in phase starts
feeling slow in use.
