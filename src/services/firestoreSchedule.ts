import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type { CalendarEvent, SyncResponse } from '../types/calendar';

const MAX_CLOUD_EVENTS = 250;
const BATCH_CHUNK_SIZE = 400;

function clampString(value: string, maxLen: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function sanitizeEventId(rawId: string): string {
  // Produce a deterministic ^[a-zA-Z0-9_-]{1,128}$ document ID
  let hash = 2166136261;
  for (let i = 0; i < rawId.length; i++) {
    hash ^= rawId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  const cleanPrefix = rawId
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 96);
  const combined = `${cleanPrefix || 'ev'}_${suffix}`;
  return combined.slice(0, 128);
}

export interface FirestoreUserProfile {
  userId: string;
  cloudplanUsername: string;
  calendarName: string;
  lastSyncedAt: string;
  eventCount: number;
  theme: 'light' | 'dark';
}

export async function syncScheduleToFirestore(
  userId: string,
  schedule: SyncResponse,
  cloudplanUsername: string,
  theme: 'light' | 'dark'
): Promise<void> {
  const userDocPath = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  let existingCreatedAt: unknown = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingCreatedAt = snap.data().createdAt ?? null;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userDocPath);
  }

  const eventsToPersist = schedule.events.slice(0, MAX_CLOUD_EVENTS);
  const desiredMap = new Map<string, CalendarEvent>();
  for (const ev of eventsToPersist) {
    const safeId = sanitizeEventId(ev.id || `${ev.uid}_${ev.start}`);
    desiredMap.set(safeId, ev);
  }

  const eventsColPath = `users/${userId}/events`;
  const existingEventIds = new Set<string>();
  try {
    const q = query(collection(db, 'users', userId, 'events'), where('userId', '==', userId));
    const existingSnap = await getDocs(q);
    existingSnap.forEach((d) => {
      existingEventIds.add(d.id);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, eventsColPath);
  }

  // Upsert profile first (Master Gate for subcollection writes)
  const profilePayload = {
    userId,
    cloudplanUsername: clampString(cloudplanUsername || 'andrewsplan-user', 160),
    calendarName: clampString(schedule.calendarName || 'AndrewsPlan Schedule', 160),
    lastSyncedAt: clampString(schedule.syncedAt || new Date().toISOString(), 64),
    eventCount: schedule.eventCount,
    theme,
    createdAt: existingCreatedAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, profilePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userDocPath);
  }

  // Prepare event writes and deletions in chunked batches
  const operations: Array<{ type: 'set' | 'delete'; eventId: string; event?: CalendarEvent }> = [];

  for (const [eventId, ev] of desiredMap.entries()) {
    operations.push({ type: 'set', eventId, event: ev });
  }
  for (const oldId of existingEventIds) {
    if (!desiredMap.has(oldId)) {
      operations.push({ type: 'delete', eventId: oldId });
    }
  }

  for (let i = 0; i < operations.length; i += BATCH_CHUNK_SIZE) {
    const chunk = operations.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const op of chunk) {
      const eventRef = doc(db, 'users', userId, 'events', op.eventId);
      if (op.type === 'delete') {
        batch.delete(eventRef);
      } else if (op.event) {
        const ev = op.event;
        const payload = {
          userId,
          eventId: op.eventId,
          uid: clampString(ev.uid || op.eventId, 256),
          summary: clampString(ev.summary || 'Untitled Event', 300),
          description: clampString(ev.description || '', 4000),
          location: clampString(ev.location || '', 400),
          start: clampString(ev.start, 64),
          end: clampString(ev.end, 64),
          allDay: Boolean(ev.allDay),
          isRecurring: Boolean(ev.isRecurring),
          status: clampString(ev.status || '', 64),
          organizer: clampString(ev.organizer || '', 240),
          url: clampString(ev.url || '', 512),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (existingEventIds.has(op.eventId)) {
          batch.update(eventRef, {
            uid: payload.uid,
            summary: payload.summary,
            description: payload.description,
            location: payload.location,
            start: payload.start,
            end: payload.end,
            allDay: payload.allDay,
            isRecurring: payload.isRecurring,
            status: payload.status,
            organizer: payload.organizer,
            url: payload.url,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(eventRef, payload);
        }
      }
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, eventsColPath);
    }
  }
}

export async function updateThemeInFirestore(
  userId: string,
  theme: 'light' | 'dark'
): Promise<void> {
  const userDocPath = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    await updateDoc(userRef, {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userDocPath);
  }
}

export function subscribeToFirestoreSchedule(
  userId: string,
  onProfile: (profile: FirestoreUserProfile | null) => void,
  onEvents: (events: CalendarEvent[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const userDocPath = `users/${userId}`;
  const eventsColPath = `users/${userId}/events`;

  const unsubProfile = onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onProfile(null);
        return;
      }
      const data = snapshot.data();
      onProfile({
        userId: String(data.userId ?? userId),
        cloudplanUsername: String(data.cloudplanUsername ?? ''),
        calendarName: String(data.calendarName ?? 'AndrewsPlan Schedule'),
        lastSyncedAt: String(data.lastSyncedAt ?? ''),
        eventCount: Number(data.eventCount ?? 0),
        theme: data.theme === 'dark' ? 'dark' : 'light',
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, userDocPath);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const q = query(collection(db, 'users', userId, 'events'), where('userId', '==', userId));
  const unsubEvents = onSnapshot(
    q,
    (snapshot) => {
      const items: CalendarEvent[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          id: String(d.eventId ?? docSnap.id),
          uid: String(d.uid ?? docSnap.id),
          summary: String(d.summary ?? 'Untitled Event'),
          description: String(d.description ?? ''),
          location: String(d.location ?? ''),
          start: String(d.start ?? ''),
          end: String(d.end ?? ''),
          allDay: Boolean(d.allDay),
          isRecurring: Boolean(d.isRecurring),
          status: String(d.status ?? ''),
          organizer: String(d.organizer ?? ''),
          categories: [],
          url: String(d.url ?? ''),
        });
      });
      items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      onEvents(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, eventsColPath);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    unsubProfile();
    unsubEvents();
  };
}
