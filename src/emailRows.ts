import type { EmailItem, EmailReport } from './types';

export interface EmailRow {
  /** Stable todo id for this mail. */
  id: string;
  sectionTitle: string;
  item: EmailItem;
}

/**
 * Derives the rows of an email report together with their todo ids.
 *
 * Every consumer must go through this: ids have to match the ones stored in the day
 * file, and two mails can legitimately share a subject within one section (repeated
 * notifications), so the id carries an occurrence counter to stay unique.
 */
export function emailRows(report: EmailReport): EmailRow[] {
  const seen = new Map<string, number>();
  return report.sections.flatMap((section) =>
    section.items.map((item) => {
      const base = `${section.title}::${item.subject}`;
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      return {
        id: occurrence === 0 ? base : `${base}::${occurrence}`,
        sectionTitle: section.title,
        item,
      };
    }),
  );
}

/** Rows of one section, in report order, with their ids. */
export function sectionRows(report: EmailReport, sectionTitle: string): EmailRow[] {
  return emailRows(report).filter((row) => row.sectionTitle === sectionTitle);
}
