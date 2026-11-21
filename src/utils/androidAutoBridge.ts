import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CalendarEvent, StoredCredentials } from '../types/calendar';
import { eventStartsOrContinuesFromToday, getEventEffectiveRange } from './dateUtils';
import { extractPhoneNumbers } from './eventLinks';

interface CarScheduleBridgePlugin {
  syncSchedule(options: {
    eventsJson: string;
    calendarName: string;
    syncedAt: string;
    username: string;
    password: string;
  }): Promise<void>;
  clearSchedule(): Promise<void>;
}

const CarScheduleBridge = registerPlugin<CarScheduleBridgePlugin>('CarScheduleBridge');

interface SerializedCarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarTitle: string;
  organizer: string;
  phoneDisplay: string;
  phoneHref: string;
}

export async function syncScheduleToAndroidAuto(params: {
  events: CalendarEvent[];
  calendarName: string;
  syncedAt: string | null;
  credentials: StoredCredentials | null;
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('CarScheduleBridge')) {
    return;
  }

  const now = new Date();
  const isDemo = params.credentials?.username?.trim().toLowerCase() === 'demo';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const serialized: SerializedCarEvent[] = params.events
    .filter((ev) => eventStartsOrContinuesFromToday(ev, startOfToday))
    .slice(0, 150)
    .map((ev) => {
      const primaryPhone = extractPhoneNumbers([ev.summary, ev.location, ev.description])[0];
      const range = getEventEffectiveRange(ev);
      const phoneDisplay = (isDemo || ev.phoneDisplay) ? (ev.phoneDisplay || '0800 5200200') : (primaryPhone?.display ?? '');
      const phoneHref = (isDemo || ev.phoneHref) ? (ev.phoneHref || 'tel:08005200200') : (primaryPhone?.href ?? '');
      return {
        id: ev.id,
        summary: ev.summary,
        description: ev.description,
        location: ev.location,
        start: ev.allDay ? new Date(range.startMs).toISOString() : ev.start,
        end: ev.allDay ? new Date(range.endMs).toISOString() : ev.end,
        allDay: ev.allDay,
        calendarTitle: ev.calendarTitle || (ev.source === 'google' ? 'Google Calendar' : 'AndrewsPlan'),
        organizer: ev.organizer,
        phoneDisplay,
        phoneHref,
      };
    });

  try {
    await CarScheduleBridge.syncSchedule({
      eventsJson: JSON.stringify(serialized),
      calendarName: params.calendarName,
      syncedAt: params.syncedAt ?? '',
      username: params.credentials?.remember ? params.credentials.username : '',
      password: params.credentials?.remember ? params.credentials.password : '',
    });
  } catch {
    // Ignore when bridge is unavailable (e.g., web browser)
  }
}

export async function clearAndroidAutoSchedule(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('CarScheduleBridge')) {
    return;
  }

  try {
    await CarScheduleBridge.clearSchedule();
  } catch {
    // Ignore when bridge is unavailable
  }
}
