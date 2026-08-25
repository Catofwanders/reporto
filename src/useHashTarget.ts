import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the element the URL hash names and flashes it once.
 *
 * The palette navigates to `/jira#<KEY>`, which lands on a board of thirty cards where
 * the answer is somewhere off-screen; without this the jump is technically correct and
 * useless. Runs on every hash change, so choosing a second ticket moves again.
 */
export function useHashTarget(deps: unknown[] = []) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    // The list may render a frame after navigation, so look on the next frame rather than
    // giving up when the element is not there yet.
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('is-flash');
      setTimeout(() => target.classList.remove('is-flash'), 1500);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass what they render
  }, [hash, ...deps]);
}
