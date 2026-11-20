import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  googleSignOut,
  initAuth,
} from '../lib/firebase';
import {
  GoogleAuthExpiredError,
  createGoogleCalendarEvent,
  createSecondaryGoogleCalendar,
  deleteGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
  fetchGoogleCalendars,
  pushCloudplanEventsToGoogle,
  type CreateGoogleEventInput,
} from '../services/googleCalendar';
import type { CalendarEvent, GoogleCalendarInfo } from '../types/calendar';

const SELECTED_CALENDAR_KEY = 'cloudplan_gcal_selected_id_v1';

export function useGoogleCalendar() {
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(true);
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_CALENDAR_KEY) || 'primary';
    } catch {
      return 'primary';
    }
  });
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMutatingGoogle, setIsMutatingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);

  const loadCalendarData = useCallback(
    async (tokenOverride?: string, targetCalendarId?: string) => {
      const token = tokenOverride || getAccessToken();
      if (!token) {
        setNeedsGoogleAuth(true);
        return;
      }

      setIsGoogleLoading(true);
      setGoogleError(null);

      try {
        const list = await fetchGoogleCalendars(token);
        setCalendars(list);

        const activeId = targetCalendarId || selectedCalendarId;
        const matched = list.find((c) => c.id === activeId) || list.find((c) => c.primary) || list[0];
        if (!matched) {
          setGoogleEvents([]);
          return;
        }

        if (matched.id !== activeId) {
          setSelectedCalendarId(matched.id);
          try {
            localStorage.setItem(SELECTED_CALENDAR_KEY, matched.id);
          } catch {
            // Ignore storage errors
          }
        }

        const canEdit = matched.accessRole === 'owner' || matched.accessRole === 'writer';
        const events = await fetchGoogleCalendarEvents(token, matched.id, matched.summary, canEdit);
        setGoogleEvents(events);
        setNeedsGoogleAuth(false);
      } catch (err) {
        if (err instanceof GoogleAuthExpiredError) {
          clearAccessToken();
          setNeedsGoogleAuth(true);
          setGoogleError(err.message);
        } else {
          setGoogleError(err instanceof Error ? err.message : 'Failed to load Google Calendar.');
        }
      } finally {
        setIsGoogleLoading(false);
      }
    },
    [selectedCalendarId]
  );

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setNeedsGoogleAuth(false);
        void loadCalendarData(token);
      },
      (user) => {
        setGoogleUser(user);
        setNeedsGoogleAuth(true);
        if (!user) {
          setCalendars([]);
          setGoogleEvents([]);
        }
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGoogleCalendar = useCallback(async () => {
    setGoogleError(null);
    setGoogleNotice(null);
    setIsGoogleLoading(true);
    try {
      const { user, accessToken } = await googleSignIn();
      setGoogleUser(user);
      setNeedsGoogleAuth(false);
      await loadCalendarData(accessToken);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Google Calendar sign-in failed.');
      setIsGoogleLoading(false);
    }
  }, [loadCalendarData]);

  const disconnectGoogleCalendar = useCallback(async () => {
    setGoogleError(null);
    setGoogleNotice(null);
    try {
      await googleSignOut();
      setGoogleUser(null);
      setNeedsGoogleAuth(true);
      setCalendars([]);
      setGoogleEvents([]);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Failed to disconnect Google account.');
    }
  }, []);

  const selectCalendar = useCallback(
    (calendarId: string) => {
      setSelectedCalendarId(calendarId);
      try {
        localStorage.setItem(SELECTED_CALENDAR_KEY, calendarId);
      } catch {
        // Ignore storage errors
      }
      if (!needsGoogleAuth) {
        void loadCalendarData(undefined, calendarId);
      }
    },
    [needsGoogleAuth, loadCalendarData]
  );

  const refreshGoogleCalendar = useCallback(async () => {
    if (needsGoogleAuth) return;
    await loadCalendarData();
  }, [needsGoogleAuth, loadCalendarData]);

  const pushToGoogleCalendar = useCallback(
    async (cloudplanEvents: CalendarEvent[]) => {
      const token = getAccessToken();
      if (!token) {
        setNeedsGoogleAuth(true);
        return;
      }

      setIsMutatingGoogle(true);
      setGoogleError(null);
      setGoogleNotice(null);
      try {
        const result = await pushCloudplanEventsToGoogle(token, selectedCalendarId, cloudplanEvents);
        setGoogleNotice(
          `Synced to Google Calendar: ${result.created} added, ${result.updated} updated.`
        );
        await loadCalendarData(token, selectedCalendarId);
      } catch (err) {
        if (err instanceof GoogleAuthExpiredError) {
          clearAccessToken();
          setNeedsGoogleAuth(true);
        }
        setGoogleError(
          err instanceof Error ? err.message : 'Failed to push events to Google Calendar.'
        );
      } finally {
        setIsMutatingGoogle(false);
      }
    },
    [selectedCalendarId, loadCalendarData]
  );

  const createDedicatedCalendar = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsGoogleAuth(true);
      return;
    }

    setIsMutatingGoogle(true);
    setGoogleError(null);
    setGoogleNotice(null);
    try {
      const created = await createSecondaryGoogleCalendar(token, 'AndrewsPlan Schedule');
      setGoogleNotice(`Created Google Calendar "${created.summary}".`);
      setSelectedCalendarId(created.id);
      try {
        localStorage.setItem(SELECTED_CALENDAR_KEY, created.id);
      } catch {
        // Ignore storage errors
      }
      await loadCalendarData(token, created.id);
    } catch (err) {
      if (err instanceof GoogleAuthExpiredError) {
        clearAccessToken();
        setNeedsGoogleAuth(true);
      }
      setGoogleError(
        err instanceof Error ? err.message : 'Failed to create Google Calendar.'
      );
    } finally {
      setIsMutatingGoogle(false);
    }
  }, [loadCalendarData]);

  const createEvent = useCallback(
    async (input: CreateGoogleEventInput) => {
      const token = getAccessToken();
      if (!token) {
        setNeedsGoogleAuth(true);
        return false;
      }

      setIsMutatingGoogle(true);
      setGoogleError(null);
      setGoogleNotice(null);
      try {
        await createGoogleCalendarEvent(token, selectedCalendarId, input);
        setGoogleNotice(`Added "${input.summary}" to Google Calendar.`);
        await loadCalendarData(token, selectedCalendarId);
        return true;
      } catch (err) {
        if (err instanceof GoogleAuthExpiredError) {
          clearAccessToken();
          setNeedsGoogleAuth(true);
        }
        setGoogleError(err instanceof Error ? err.message : 'Failed to create event.');
        return false;
      } finally {
        setIsMutatingGoogle(false);
      }
    },
    [selectedCalendarId, loadCalendarData]
  );

  const deleteEvent = useCallback(
    async (calendarId: string, googleEventId: string, summary: string) => {
      const token = getAccessToken();
      if (!token) {
        setNeedsGoogleAuth(true);
        return false;
      }

      setIsMutatingGoogle(true);
      setGoogleError(null);
      setGoogleNotice(null);
      try {
        await deleteGoogleCalendarEvent(token, calendarId, googleEventId);
        setGoogleNotice(`Removed "${summary}" from Google Calendar.`);
        await loadCalendarData(token, selectedCalendarId);
        return true;
      } catch (err) {
        if (err instanceof GoogleAuthExpiredError) {
          clearAccessToken();
          setNeedsGoogleAuth(true);
        }
        setGoogleError(err instanceof Error ? err.message : 'Failed to delete event.');
        return false;
      } finally {
        setIsMutatingGoogle(false);
      }
    },
    [selectedCalendarId, loadCalendarData]
  );

  const activeCalendar = calendars.find((c) => c.id === selectedCalendarId) || calendars[0] || null;

  return {
    googleUser,
    needsGoogleAuth,
    calendars,
    activeCalendar,
    selectedCalendarId,
    googleEvents,
    isGoogleLoading,
    isMutatingGoogle,
    googleError,
    googleNotice,
    clearGoogleNotice: () => setGoogleNotice(null),
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    selectCalendar,
    refreshGoogleCalendar,
    pushToGoogleCalendar,
    createDedicatedCalendar,
    createEvent,
    deleteEvent,
  };
}
