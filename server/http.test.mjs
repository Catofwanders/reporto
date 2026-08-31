import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchWithTimeout } from './http.mjs'

const servers = []

const listen = async (handler) => {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(() => {
  while (servers.length) servers.pop().close()
})

describe('fetchWithTimeout', () => {
  /*
   * The failure this exists for is a socket that accepts and then says nothing — a dropped
   * VPN, a proxy holding the connection. Without a deadline the pull never resolves, so the
   * endpoint never answers and the update button spins for the rest of the day.
   */
  it('gives up on a host that accepts and never answers', async () => {
    const base = await listen(() => {
      /* deliberately no response */
    })
    const started = Date.now()
    await expect(fetchWithTimeout(`${base}/hangs`, {}, 300)).rejects.toThrow(
      /no answer from 127\.0\.0\.1:\d+ within 0s|no answer from 127\.0\.0\.1:\d+ within 1s/,
    )
    // The point is that it returns at all, and roughly when asked rather than much later.
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('names the host and the budget, because a timeout reads like bad credentials otherwise', async () => {
    const base = await listen(() => {})
    await expect(fetchWithTimeout(`${base}/hangs`, {}, 2000)).rejects.toThrow(
      /no answer from .+ within 2s/,
    )
  })

  it('passes a healthy response straight through', async () => {
    const base = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
    const res = await fetchWithTimeout(`${base}/fine`, {}, 2000)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })

  it('leaves a non-timeout failure alone, so a refused connection still says so', async () => {
    // Nothing is listening on this port; the error must not be reported as a timeout.
    await expect(fetchWithTimeout('http://127.0.0.1:1/nothing', {}, 2000)).rejects.not.toThrow(
      /no answer from/,
    )
  })

  it('sends the method and headers it was given', async () => {
    let seen
    const base = await listen((req, res) => {
      seen = { method: req.method, header: req.headers['x-probe'] }
      res.writeHead(204)
      res.end()
    })
    await fetchWithTimeout(`${base}/echo`, { method: 'POST', headers: { 'X-Probe': 'yes' } }, 2000)
    expect(seen).toEqual({ method: 'POST', header: 'yes' })
  })
})
