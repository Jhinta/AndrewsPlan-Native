export type EventSource = 'cloudplan' | 'google';

export interface CalendarEvent {
  id: string;
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  isRecurring: boolean;
  status: string;
  organizer: string;
  categories: string[];
  url: string;
  source?: EventSource;
  calendarId?: string;
  calendarTitle?: string;
  googleEventId?: string;
  canEdit?: boolean;
  phoneDisplay?: string;
  phoneHref?: string;
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

export interface SyncResponse {
  calendarName: string;
  sourceUrl: string;
  syncedAt: string;
  eventCount: number;
  events: CalendarEvent[];
}

export interface StoredCredentials {
  username: string;
  password: string;
  remember: boolean;
}

export type ScheduleFilter = 'upcoming' | 'today' | 'all';
export type SourceFilter = 'all' | 'cloudplan' | 'google';
export type MobileTab = 'agenda' | 'upcoming' | 'summary' | 'account';
export type DesktopView = 'schedule' | 'summary';
export type EventMapProvider = 'google' | 'osm';

