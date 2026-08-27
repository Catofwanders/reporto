import { useState } from 'react';
import type { JiraReport, PrsReport } from '../types';
import { TicketDrawer } from './TicketDrawer';

/**
 * Drawer state for a view full of tickets.
 *
 * Shared because the board and the list both show the same tickets and must open the same
 * drawer: two copies of "which key is open" is how one of them ends up with a drawer that
 * keeps the old status after a transition, or with none at all.
 *
 * The open ticket is looked up by key on every render rather than held: a refetch replaces the
 * report object, and a stored copy would go stale the moment the thing it describes moved.
 */
export const useTicketReader = ({
  report,
  prs = null,
  onChanged,
}: {
  report: JiraReport;
  prs?: PrsReport | null;
  onChanged?: () => void;
}) => {
  const [reading, setReading] = useState<string | null>(null);
  const open = report.groups
    .flatMap((group) => group.tickets)
    .find((ticket) => ticket.key === reading);

  return {
    read: (key: string) => setReading(key),
    drawer: open ? (
      <TicketDrawer
        ticket={open}
        prs={prs}
        onClose={() => setReading(null)}
        onChanged={onChanged}
      />
    ) : null,
  };
};
