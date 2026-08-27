/**
 * How old something is, in the shortest form that still says it: minutes inside the hour,
 * hours inside the day, then the date. "never" is a real state — a fresh checkout has no
 * reports at all, and a ticket can have no comments.
 *
 * Shared rather than copied: the sidebar's report ages and the ticket drawer's comment
 * timestamps have to agree, or the same instant reads as "2h ago" in one place and a date in
 * the other.
 */
export const timeAgo = (iso: string | undefined | null): string => {
  if (!iso) return 'never';
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 'never';
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
