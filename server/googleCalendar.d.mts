import type { CalendarEvent, CalendarReport } from '../src/types';

export function pullGoogleCalendar(options: {
  /** Service-account JSON key: a file path, or the JSON itself. Preferred. */
  serviceAccount?: string;
  /** Calendar addresses to read. Required for a service account, which cannot enumerate. */
  calendarIds?: string[];
  /** Installed-app OAuth, for calendars that cannot be shared with a service account. */
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** Calendar names to include; empty means every readable calendar. */
  include?: string[];
  /** Calendar names to skip (birthdays, holidays, whatever is noise). */
  exclude?: string[];
  upcomingDays?: number;
  /** Non-Google events from the previous report, carried over instead of dropped. */
  keepEvents?: CalendarEvent[];
}): Promise<CalendarReport>;
