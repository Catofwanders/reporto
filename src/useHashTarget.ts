import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the element the URL hash names and flashes it once.
 *
 * The palette navigates to `/jira#<KEY>`, which lands on a board of thirty cards where
 * the answer is somewhere off-screen; without this the jump is technically correct and
 * useless. Runs on every hash change, so choosing a second ticket moves again.
 *
 * It also moves the keyboard, not just the viewport. Every dashboard queue row is a link to a
 * hash on another page, so without this a keyboard user arrived with focus on a destroyed
 * element — which resets it to `<body>`, and the next Tab starts again from the rail.
 */
export function useHashTarget(deps: unknown[] = []) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));

    /*
     * Retried rather than tried once on the next frame. A row can arrive several commits after
     * navigation — the report is still loading, or its lane is an accordion that mounts its
     * children late — and a single `requestAnimationFrame` silently gave up on exactly those,
     * which is why following a queue row sometimes landed at the top of the page.
     */
    let attempts = 0;
    let timer: number | undefined;
    const find = () => {
      const target = document.getElementById(id);
      if (!target) {
        if (attempts++ > 16) return;
        timer = window.setTimeout(find, 120);
        return;
      }
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // `-1`, not `0`: reachable programmatically, never a tab stop of its own. Without this the
      // keyboard stayed on a link that no longer exists, which resets focus to <body>.
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.classList.add('is-flash');
      timer = window.setTimeout(() => target.classList.remove('is-flash'), 1500);
    };
    /*
     * Timers, not `requestAnimationFrame`. A hidden tab does not animate, so a rAF-scheduled
     * lookup never ran there — which is exactly the case that matters: the hash is followed
     * while the window is in the background often enough (a link opened from elsewhere), and
     * the row was then never scrolled to, never flashed and never focused.
     */
    find();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass what they render
  }, [hash, ...deps]);
}
