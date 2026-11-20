import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  subscribeToFirestoreSchedule,
  syncScheduleToFirestore,
  updateThemeInFirestore,
  type FirestoreUserProfile,
} from '../services/firestoreSchedule';
import type { CalendarEvent, SyncResponse } from '../types/calendar';

export function useFirebaseSync(
  localSchedule: SyncResponse | null,
  cloudplanUsername: string | null,
  theme: 'light' | 'dark'
) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudProfile, setCloudProfile] = useState<FirestoreUserProfile | null>(null);
  const [cloudEvents, setCloudEvents] = useState<CalendarEvent[] | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const lastPushedSyncedAtRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setCloudProfile(null);
        setCloudEvents(null);
        setCloudError(null);
        lastPushedSyncedAtRef.current = null;
      }
    });
    return unsub;
  }, []);

  // Only attach Firestore onSnapshot listeners when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const unsub = subscribeToFirestoreSchedule(
      firebaseUser.uid,
      (profile) => setCloudProfile(profile),
      (events) => setCloudEvents(events),
      (err) => {
        setCloudError(err.message);
      }
    );

    return unsub;
  }, [authReady, firebaseUser]);

  // Automatically persist newly synced Cloudplan schedules to Firestore
  useEffect(() => {
    if (!authReady || !firebaseUser || !localSchedule || !cloudplanUsername) return;
    if (lastPushedSyncedAtRef.current === localSchedule.syncedAt) return;

    let cancelled = false;
    lastPushedSyncedAtRef.current = localSchedule.syncedAt;
    setIsCloudSyncing(true);
    setCloudError(null);

    syncScheduleToFirestore(firebaseUser.uid, localSchedule, cloudplanUsername, theme)
      .catch((err) => {
        if (!cancelled) {
          lastPushedSyncedAtRef.current = null;
          setCloudError(err instanceof Error ? err.message : 'Failed to sync schedule to Firestore.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCloudSyncing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, localSchedule, cloudplanUsername, theme]);

  const signInWithGoogle = useCallback(async () => {
    setCloudError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setCloudError(msg);
    }
  }, []);

  const signOutGoogle = useCallback(async () => {
    setCloudError(null);
    try {
      await signOut(auth);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign out of Google.';
      setCloudError(msg);
    }
  }, []);

  const syncTheme = useCallback(
    async (nextTheme: 'light' | 'dark') => {
      if (!firebaseUser) return;
      try {
        await updateThemeInFirestore(firebaseUser.uid, nextTheme);
      } catch (err) {
        setCloudError(err instanceof Error ? err.message : 'Failed to save theme preference.');
      }
    },
    [firebaseUser]
  );

  return {
    firebaseUser,
    authReady,
    cloudProfile,
    cloudEvents,
    isCloudSyncing,
    cloudError,
    signInWithGoogle,
    signOutGoogle,
    syncTheme,
  };
}
