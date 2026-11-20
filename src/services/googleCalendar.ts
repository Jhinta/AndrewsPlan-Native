import type { CalendarEvent, GoogleCalendarInfo } from '../types/calendar';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export class GoogleAuthExpiredError extends Error {
  constructor(message = 'Google Calendar session expired. Please sign in with Google again.') {
    super(message);
    this.name = 'GoogleAuthExpiredError';
  }
}

interface GoogleCalendarListResponse {
  items?: Array<{
    id?: string;
    summary?: string;
    primary?: boolean;
    accessRole?: string;
  }>;
}

interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
}

interface GoogleEventItem {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  recurringEventId?: string;
  organizer?: { displayName?: string; email?: string };
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

interface GoogleEventsListResponse {
  items?: GoogleEventItem[];
}

async function calendarFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (res.status === 401) {
      throw new GoogleAuthExpiredError();
    }
    throw new Error(body.error?.message || `Google Calendar permission denied (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message || `Google Calendar error (HTTP ${res.status}).`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

function parseGoogleDate(dt: GoogleEventDateTime | undefined, fallbackIso: string): {
  iso: string;
  allDay: boolean;
} {
  if (dt?.dateTime) {
    const d = new Date(dt.dateTime);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString(), allDay: false };
    }
  }
  if (dt?.date) {
    const [y, m, day] = dt.date.split('-').map(Number);
    const localDate = new Date(y, m - 1, day, 0, 0, 0, 0);
    return { iso: localDate.toISOString(), allDay: true };
  }
  return { iso: fallbackIso, allDay: false };
}

export async function fetchGoogleCalendars(accessToken: string): Promise<GoogleCalendarInfo[]> {
  const data = await calendarFetch<GoogleCalendarListResponse>(
    '/users/me/calendarList?minAccessRole=reader',
    accessToken
  );
  const items = data.items ?? [];
  return items
    .filter((item): item is { id: string; summary?: string; primary?: boolean; accessRole?: string } => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      summary: item.summary || (item.primary ? 'Primary Calendar' : item.id),
      primary: Boolean(item.primary),
      accessRole: item.accessRole || 'reader',
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  calendarTitle: string,
  canEdit: boolean
): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin,
    timeMax,
    maxResults: '250',
  });

  const data = await calendarFetch<GoogleEventsListResponse>(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    accessToken
  );

  const items = data.items ?? [];
  return items
    .filter((item) => Boolean(item.id && (item.start?.dateTime || item.start?.date)))
    .map((item) => {
      const startParsed = parseGoogleDate(item.start, now.toISOString());
      const endParsed = parseGoogleDate(
        item.end,
        new Date(new Date(startParsed.iso).getTime() + 60 * 60 * 1000).toISOString()
      );
      const organizer = item.organizer?.displayName || item.organizer?.email || '';

      return {
        id: `gcal::${calendarId}::${item.id}`,
        uid: item.iCalUID || item.id || '',
        summary: item.summary?.trim() || 'Untitled Event',
        description: item.description?.trim() || '',
        location: item.location?.trim() || '',
        start: startParsed.iso,
        end: endParsed.iso,
        allDay: startParsed.allDay,
        isRecurring: Boolean(item.recurringEventId),
        status: item.status?.toUpperCase() || '',
        organizer,
        categories: [],
        url: item.htmlLink || '',
        source: 'google' as const,
        calendarId,
        calendarTitle,
        googleEventId: item.id,
        canEdit,
      };
    });
}

export async function createSecondaryGoogleCalendar(
  accessToken: string,
  summary: string
): Promise<GoogleCalendarInfo> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const created = await calendarFetch<{ id: string; summary: string }>(
    '/calendars',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        summary,
        description: 'Synced from AndrewsPlan schedule',
        timeZone,
      }),
    }
  );
  return {
    id: created.id,
    summary: created.summary || summary,
    primary: false,
    accessRole: 'owner',
  };
}

export interface CreateGoogleEventInput {
  summary: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  allDay: boolean;
  location: string;
  description: string;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: CreateGoogleEventInput
): Promise<void> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const body = input.allDay
    ? (() => {
        const [y, m, d] = input.date.split('-').map(Number);
        const nextDay = new Date(y, m - 1, d + 1);
        const endStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
        return {
          summary: input.summary.trim(),
          location: input.location.trim() || undefined,
          description: input.description.trim() || undefined,
          start: { date: input.date },
          end: { date: endStr },
        };
      })()
    : (() => {
        const startLocal = new Date(`${input.date}T${input.startTime}:00`);
        let endLocal = new Date(`${input.date}T${input.endTime}:00`);
        if (endLocal.getTime() <= startLocal.getTime()) {
          endLocal = new Date(startLocal.getTime() + 60 * 60 * 1000);
        }
        return {
          summary: input.summary.trim(),
          location: input.location.trim() || undefined,
          description: input.description.trim() || undefined,
          start: { dateTime: startLocal.toISOString(), timeZone },
          end: { dateTime: endLocal.toISOString(), timeZone },
        };
      })();

  await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string
): Promise<void> {
  await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    accessToken,
    { method: 'DELETE' }
  );
}

function toDateOnly(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function pushCloudplanEventsToGoogle(
  accessToken: string,
  calendarId: string,
  events: CalendarEvent[]
): Promise<{ created: number; updated: number }> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const upcoming = events
    .filter((ev) => new Date(ev.end).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
    .slice(0, 100);

  // Fetch existing events tagged with cloudplanId to avoid duplicates
  const existingMap = new Map<string, string>();
  const existingData = await calendarFetch<GoogleEventsListResponse>(
    `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&singleEvents=false`,
    accessToken
  );
  for (const item of existingData.items ?? []) {
    const tag = item.extendedProperties?.private?.cloudplanId;
    if (tag && item.id) {
      existingMap.set(tag, item.id);
    }
  }

  let created = 0;
  let updated = 0;

  for (const ev of upcoming) {
    const startDate = toDateOnly(ev.start);
    let endDate = toDateOnly(ev.end);
    if (ev.allDay && endDate <= startDate) {
      const d = new Date(ev.start);
      d.setDate(d.getDate() + 1);
      endDate = toDateOnly(d.toISOString());
    }

    const payload = {
      summary: ev.summary,
      location: ev.location || undefined,
      description: ev.description || undefined,
      start: ev.allDay ? { date: startDate } : { dateTime: ev.start, timeZone },
      end: ev.allDay ? { date: endDate } : { dateTime: ev.end, timeZone },
      extendedProperties: {
        private: {
          cloudplanId: ev.id,
        },
      },
    };

    const existingGoogleId = existingMap.get(ev.id);
    if (existingGoogleId) {
      await calendarFetch(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingGoogleId)}`,
        accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      updated += 1;
    } else {
      await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      created += 1;
    }
  }

  return { created, updated };
}
