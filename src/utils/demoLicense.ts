declare const __DEMO_BUILD_TIMESTAMP__: number | undefined;

export const DEMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const DEMO_STARTED_KEY = 'cloudplan_demo_started_at_v1';
const LICENSE_UNLOCKED_KEY = 'cloudplan_full_unlocked_v1';
const UNLOCK_STORAGE_VALUE = 'activated_v1';

export interface DemoLicenseStatus {
  isUnlocked: boolean;
  isExpired: boolean;
  startedAtMs: number;
  expiresAtMs: number;
  remainingMs: number;
  remainingLabel: string;
}

function hashFnv(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hashMix(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761) >>> 0;
  }
  return h >>> 0;
}

function getBuildTimestampMs(): number {
  if (typeof __DEMO_BUILD_TIMESTAMP__ === 'number' && Number.isFinite(__DEMO_BUILD_TIMESTAMP__)) {
    return __DEMO_BUILD_TIMESTAMP__;
  }
  return Date.now();
}

function getOrCreateStartedAtMs(nowMs: number): number {
  const buildTs = getBuildTimestampMs();
  try {
    const raw = localStorage.getItem(DEMO_STARTED_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(parsed, buildTs);
      }
    }
    const anchor = Math.min(nowMs, buildTs);
    localStorage.setItem(DEMO_STARTED_KEY, String(anchor));
    return anchor;
  } catch {
    return buildTs;
  }
}

export function isFullVersionUnlocked(): boolean {
  try {
    return localStorage.getItem(LICENSE_UNLOCKED_KEY) === UNLOCK_STORAGE_VALUE;
  } catch {
    return false;
  }
}

export function verifyUnlockPassword(password: string): boolean {
  const trimmed = password.trim();
  return (
    trimmed.length === 14 &&
    hashFnv(trimmed) === 3877079379 &&
    hashMix(trimmed) === 2163857911
  );
}

export function unlockFullVersion(password: string): boolean {
  if (!verifyUnlockPassword(password)) {
    return false;
  }
  try {
    localStorage.setItem(LICENSE_UNLOCKED_KEY, UNLOCK_STORAGE_VALUE);
  } catch {
    // Even if storage fails, allow unlocking for current session
  }
  return true;
}

export function formatDemoRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return 'Expired';
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    return `${days}d ${hours}h left`;
  }
  if (hours >= 1) {
    return `${hours}h ${minutes}m left`;
  }
  return `${Math.max(1, minutes)}m left`;
}

export function getDemoLicenseStatus(nowMs: number = Date.now()): DemoLicenseStatus {
  const isUnlocked = isFullVersionUnlocked();
  const startedAtMs = getOrCreateStartedAtMs(nowMs);
  const expiresAtMs = startedAtMs + DEMO_DURATION_MS;
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const isExpired = !isUnlocked && remainingMs <= 0;

  return {
    isUnlocked,
    isExpired,
    startedAtMs,
    expiresAtMs,
    remainingMs,
    remainingLabel: isUnlocked ? 'Full version' : formatDemoRemaining(remainingMs),
  };
}
