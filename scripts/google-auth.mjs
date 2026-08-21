#!/usr/bin/env node
/**
 * One-time Google consent, installed-app style: open the consent page, catch the code on
 * a loopback port, trade it for a refresh token, and write that into .env.
 *
 * Run it yourself in a terminal — it needs a browser you are signed into:
 *   npm run google-auth
 *
 * The token is written straight to .env and never printed, so it does not end up in a
 * terminal scrollback or an agent transcript.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, '.env')
const PORT = 5399
const REDIRECT = `http://127.0.0.1:${PORT}/callback`
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      }),
  )
}

/** Replace the key if present, append it otherwise, leaving the rest of the file alone. */
function writeEnvKey(key, value) {
  const line = `${key}=${value}`
  const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
  const lines = current.split('\n')
  const at = lines.findIndex((l) => l.startsWith(`${key}=`))
  if (at === -1) {
    fs.writeFileSync(ENV_FILE, `${current.replace(/\n*$/, '\n')}${line}\n`)
  } else {
    lines[at] = line
    fs.writeFileSync(ENV_FILE, lines.join('\n'))
  }
}

const env = readEnv()
const clientId = env.GOOGLE_CLIENT_ID
const clientSecret = env.GOOGLE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error(
    'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.\n\n' +
      '  1. https://console.cloud.google.com → new project\n' +
      '  2. APIs & Services → Library → enable "Google Calendar API"\n' +
      '  3. APIs & Services → Credentials → Create credentials → OAuth client ID\n' +
      '     Application type: Desktop app\n' +
      `  4. OAuth consent screen: add the scope ${SCOPE}\n` +
      '     Publishing status Internal (Workspace) or In production — "Testing" expires\n' +
      '     the refresh token after 7 days.\n' +
      '  5. Paste the client ID and secret into .env\n',
  )
  process.exit(1)
}

const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
auth.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  // Without this an already-consented account returns no refresh token at all.
  prompt: 'consent',
}).toString()

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(
    `<p>${error ? `Consent failed: ${error}` : 'Done — close this tab and return to the terminal.'}</p>`,
  )
  server.close()
  if (!code) {
    console.error(`Consent failed: ${error ?? 'no code returned'}`)
    process.exit(1)
  }
  void exchange(code)
})

async function exchange(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.refresh_token) {
    console.error(
      `Token exchange failed: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}` +
        (res.ok ? '\nNo refresh_token came back — revoke the app at myaccount.google.com/permissions and retry.' : ''),
    )
    process.exit(1)
  }
  writeEnvKey('GOOGLE_REFRESH_TOKEN', body.refresh_token)
  console.log(`Wrote GOOGLE_REFRESH_TOKEN to ${ENV_FILE} (not printed here).`)
  console.log('Restart the dev server so it picks the new value up: npm run dev')
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Opening the consent page. If nothing happens, visit:\n${auth}\n`)
  spawn('open', [auth.toString()], { stdio: 'ignore', detached: true }).unref()
})
