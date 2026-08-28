// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

/**
 * The report loader, driven through the real component.
 *
 * These files are written by agent runs, so a missing, half-written or renamed-field report is
 * an ordinary Tuesday. What must survive it is everything else on screen: the rule is that one
 * bad report costs its own card and nothing more.
 *
 * Mocked at the fetch boundary rather than by stubbing the loader, so the SPA-fallback and
 * content-type handling — the actual source of the "Unexpected token '<'" bug — is exercised.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const html = () =>
  new Response('<!doctype html><title>reporto</title>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

const INDEX = {
  latest: { jira: 'jira-2026-05-14.json', prs: 'prs-2026-05-14.json' },
  history: [{ date: '2026-05-13', jira: 'jira-2026-05-13.json' }],
};

const JIRA = {
  type: 'jira',
  date: '2026-05-14',
  groups: [
    {
      title: 'In Progress',
      tickets: [
        {
          key: 'SHOP-812',
          url: 'https://jira.example.com/browse/SHOP-812',
          status: 'In Progress',
          chip: 'open',
          summary: 'cache the seller catalogue',
          prs: [],
          notes: [],
        },
      ],
    },
  ],
};

const PRS = {
  type: 'prs',
  date: '2026-05-14',
  author: 'you',
  repos: [
    {
      repo: 'example/orders-api',
      prs: [
        {
          num: 77,
          title: 'retry the refund webhook',
          url: 'https://example.com/pr/77',
          ticket: null,
          ticketUrl: null,
          review: 'APPROVED',
          draft: false,
          updatedAt: '2026-05-14T08:00:00Z',
        },
      ],
    },
  ],
};

/** Answers each report file from a table; anything unnamed 404s, as a missing file would. */
const serve = (files: Record<string, () => Response>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/')) return Promise.resolve(json({}));
    const name = url.split('/').pop()!.split('?')[0];
    const answer = files[name];
    return Promise.resolve(answer ? answer() : new Response('', { status: 404 }));
  });

afterEach(cleanup);

describe('the report loader', () => {
  it('renders the dashboard once the reports arrive', async () => {
    serve({
      'index.json': () => json(INDEX),
      'jira-2026-05-14.json': () => json(JIRA),
      'prs-2026-05-14.json': () => json(PRS),
    });
    render(<App />);
    expect(await screen.findByText('my open PRs')).toBeDefined();
    expect(screen.queryByText(/report is malformed/)).toBeNull();
  });

  /* The rule this whole file exists for. */
  it('keeps the good reports when one of them is malformed', async () => {
    serve({
      'index.json': () => json(INDEX),
      'jira-2026-05-14.json': () => json({ date: '2026-05-14' }), // no groups
      'jira-2026-05-13.json': () => json({ date: '2026-05-13' }), // yesterday is no better
      'prs-2026-05-14.json': () => json(PRS),
    });
    render(<App />);
    // The broken one is named, with its kind…
    expect(await screen.findByText(/jira report is malformed/)).toBeDefined();
    // …and the PR report is still on screen rather than blanked with it.
    expect(await screen.findByText('my open PRs')).toBeDefined();
  });

  /*
   * A pointer to a file that is gone costs yesterday's data, not the card: the index names a
   * history, and the loader walks it before giving up.
   */
  it('falls back to yesterday when today’s file is missing', async () => {
    serve({
      'index.json': () => json(INDEX),
      'jira-2026-05-13.json': () => json({ ...JIRA, date: '2026-05-13' }),
      'prs-2026-05-14.json': () => json(PRS),
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading reports/)).toBeNull());
    expect(screen.queryByText(/jira report is malformed/)).toBeNull();
    expect(screen.queryByText(/HTTP 404/)).toBeNull();
  });

  /*
   * The dev server answers a missing file with the app shell, and `res.ok` is true for it.
   * Trusting that is what produced "Unexpected token '<'" instead of a readable message.
   */
  it('does not mistake the SPA fallback for a report', async () => {
    serve({
      'index.json': () => json(INDEX),
      'jira-2026-05-14.json': html,
      'jira-2026-05-13.json': html,
      'prs-2026-05-14.json': () => json(PRS),
    });
    render(<App />);
    expect(await screen.findByText(/the server returned the app shell/)).toBeDefined();
    expect(await screen.findByText('my open PRs')).toBeDefined();
  });

  /* A fresh checkout has no report data at all — expected, not an error. */
  it('treats a missing index as an empty dashboard rather than a failure', async () => {
    serve({});
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading reports/)).toBeNull());
    expect(screen.queryByText(/Could not read the report index/)).toBeNull();
    expect(screen.getByText('my open PRs')).toBeDefined();
  });

  /* But an unreachable server is a failure, and must not masquerade as "no reports". */
  it('says so when the index cannot be read at all', async () => {
    serve({ 'index.json': () => new Response('', { status: 500 }) });
    render(<App />);
    expect(await screen.findByText(/Could not read the report index/)).toBeDefined();
  });
});
