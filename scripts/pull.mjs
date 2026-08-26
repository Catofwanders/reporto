#!/usr/bin/env node
/**
 * Pulls reports without a browser or a dev server, so cron can have the dashboard current
 * before the working day starts:
 *
 *   npm run pull                 # every report the API can fetch
 *   npm run pull -- jira prs     # just these
 *
 * Exits non-zero if any pull failed, which is what a cron wrapper wants to see.
 */
import { PULLABLE, loadConfig, loadDotEnv, pullReport } from '../server/reports.mjs'
import { capabilityOf } from '../server/capabilities.mjs'

loadDotEnv()

const asked = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
const unknown = asked.filter((kind) => !PULLABLE.includes(kind))
if (unknown.length) {
  console.error(`unknown report${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
  console.error(`known: ${PULLABLE.join(', ')}`)
  process.exit(2)
}

const kinds = asked.length ? asked : PULLABLE
const config = loadConfig()
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
let failed = 0

// Sequential on purpose: the pullers share one Jira token and one gh process, and a cron
// run has all the time it needs.
for (const kind of kinds) {
  // A module switched off in Settings, or missing its credentials, is skipped rather than
  // failed: cron running every morning must not mail a failure for something deliberately off.
  const capability = capabilityOf(kind, config)
  if (capability && !(capability.configured && capability.enabled)) {
    const why = capability.enabled
      ? `missing ${[...capability.missingEnv, ...capability.missingConfig].join(', ') || 'credentials'}`
      : 'switched off'
    console.log(`${stamp()}  ${kind.padEnd(9)} skipped  ${why}`)
    continue
  }
  try {
    const result = await pullReport(kind, config)
    console.log(`${stamp()}  ${kind.padEnd(9)} ${result.file}  ${result.durationMs}ms`)
  } catch (err) {
    failed += 1
    console.error(`${stamp()}  ${kind.padEnd(9)} FAILED  ${err.message}`)
  }
}

process.exit(failed ? 1 : 0)
