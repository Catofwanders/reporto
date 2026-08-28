import { useEffect, useRef, useState } from 'react';
import { KIND_META, REPORT_KINDS } from '../reportKinds';
import { useRefresh } from '../refreshContext';

/**
 * Says out loud what the refresh state only showed.
 *
 * A failed pull turned an icon red and put the reason in a `title`, which a keyboard or
 * screen-reader user never sees and a mouse user has to go hunting for. This is the one live
 * region in the app: it names the report that finished, or the one that failed and why.
 *
 * `role="status"` rather than `alert` even for failures — a pull that did not land is worth
 * saying at the next pause, not worth interrupting a sentence for. The text is visually hidden
 * because the icons already carry it on screen.
 */
export const RefreshAnnouncer = () => {
  const { running, errors } = useRefresh();
  const wasRunning = useRef<Set<string>>(new Set());
  const [said, setSaid] = useState('');

  useEffect(() => {
    const finished = REPORT_KINDS.filter(
      (kind) => wasRunning.current.has(kind) && !running.has(kind),
    );
    wasRunning.current = new Set(running);
    if (finished.length === 0) return;

    const messages = finished.map((kind) => {
      const label = KIND_META[kind].label;
      const failed = errors[kind];
      return failed ? `${label} update failed: ${failed}` : `${label} updated`;
    });
    setSaid(messages.join('. '));
  }, [running, errors]);

  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {said}
    </p>
  );
};
