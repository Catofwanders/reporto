#!/usr/bin/env node
/**
 * Re-shoots the README screenshots from Storybook:
 *
 *   npm run shots                # both palettes into docs/
 *   npm run shots -- --keep      # leave a Storybook it started running
 *
 * They had fallen behind once per redesign, because the catch-up was Storybook on a
 * hand-picked Node, two URLs, two manual screenshots and two file copies. This is the whole
 * thing in one command, and it shoots the `Pages/Home` story rather than the running app — the
 * story is on invented marketplace fixtures, so what lands in a public README carries no real
 * ticket, repository or person.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const PORT = 6007
const STORY = 'pages-home--default'
const SIZE = { width: 1552, height: 784 }
const SHOTS = [
  { palette: 'default', file: 'docs/home.jpg' },
  { palette: 'nord', file: 'docs/home-nord.jpg' },
]

const alive = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok
  } catch {
    return false
  }
}

const waitFor = async (url, seconds) => {
  for (let left = seconds; left > 0; left -= 1) {
    if (await alive(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

const root = `http://localhost:${PORT}`
let storybook = null

if (await alive(root)) {
  console.log(`using the Storybook already on ${PORT}`)
} else {
  console.log('starting Storybook…')
  // Storybook needs Node >= 20.19 (see .nvmrc); an older default fails here rather than
  // silently shooting a stale build.
  storybook = spawn('npx', ['storybook', 'dev', '-p', String(PORT), '--ci', '--quiet'], {
    stdio: 'ignore',
    detached: true,
  })
  if (!(await waitFor(root, 90))) {
    storybook.kill()
    console.error(`Storybook did not come up on ${PORT}. Node is ${process.version}; it needs >= 20.19.`)
    process.exit(1)
  }
}

await mkdir('docs', { recursive: true })
const browser = await chromium.launch()

try {
  for (const shot of SHOTS) {
    // Dark on purpose: the palettes are dark-first and a headless Chromium reports
    // prefers-color-scheme: light, which shot a README picture of a theme nobody uses.
    const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1, colorScheme: 'dark' })
    await page.goto(
      `${root}/iframe.html?id=${STORY}&viewMode=story&globals=palette:${shot.palette}`,
      { waitUntil: 'networkidle' },
    )
    // The dashboard measures itself — the timeline packs its pills from rendered widths — so
    // give it a frame after load before believing the layout.
    await page.waitForSelector('.kpi-strip')
    await page.waitForTimeout(400)
    await writeFile(shot.file, await page.screenshot({ type: 'jpeg', quality: 90 }))
    console.log(`${shot.file} — ${shot.palette}`)
    await page.close()
  }
} finally {
  await browser.close()
  if (storybook && !process.argv.includes('--keep')) process.kill(-storybook.pid)
}
