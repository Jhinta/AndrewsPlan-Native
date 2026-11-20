import {
  getAppleMapsNavigationUrl,
  getGeoNavigationUrl,
  getGoogleNavigationUrl,
  getTomTomAndroidNavigationUrl,
  getWazeNavigationUrl,
} from './eventLinks';

export type NavAppId =
  | 'google-maps'
  | 'waze'
  | 'apple-maps'
  | 'tomtom-android'
  | 'device-default';

export interface NavAppOption {
  id: NavAppId;
  name: string;
  subtitle: string;
  externalTab: boolean;
  getUrl: (location: string) => string;
}

export const DEFAULT_NAV_APP_STORAGE_KEY = 'andrewsplan_default_nav_app_v1';

export const NAV_APP_OPTIONS: NavAppOption[] = [
  {
    id: 'google-maps',
    name: 'Google Maps',
    subtitle: 'Turn-by-turn directions in Google Maps',
    externalTab: true,
    getUrl: getGoogleNavigationUrl,
  },
  {
    id: 'waze',
    name: 'Waze',
    subtitle: 'Live traffic & routing in Waze',
    externalTab: true,
    getUrl: getWazeNavigationUrl,
  },
  {
    id: 'apple-maps',
    name: 'Apple Maps',
    subtitle: 'Open directions in Apple Maps',
    externalTab: true,
    getUrl: getAppleMapsNavigationUrl,
  },
  {
    id: 'tomtom-android',
    name: 'TomTom (Android)',
    subtitle: 'Open route in TomTom GO Navigation',
    externalTab: false,
    getUrl: getTomTomAndroidNavigationUrl,
  },
  {
    id: 'device-default',
    name: 'Device Default Maps',
    subtitle: 'Let your phone choose installed GPS apps',
    externalTab: false,
    getUrl: getGeoNavigationUrl,
  },
];

const VALID_NAV_APP_IDS = new Set<string>(NAV_APP_OPTIONS.map((opt) => opt.id));

export function getSavedDefaultNavApp(): NavAppId | null {
  try {
    const saved = localStorage.getItem(DEFAULT_NAV_APP_STORAGE_KEY);
    if (saved && VALID_NAV_APP_IDS.has(saved)) {
      return saved as NavAppId;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDefaultNavApp(appId: NavAppId | null): void {
  try {
    if (appId) {
      localStorage.setItem(DEFAULT_NAV_APP_STORAGE_KEY, appId);
    } else {
      localStorage.removeItem(DEFAULT_NAV_APP_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getNavAppOption(appId: NavAppId | null): NavAppOption | null {
  if (!appId) return null;
  return NAV_APP_OPTIONS.find((opt) => opt.id === appId) ?? null;
}

export function openNavigationWithApp(appId: NavAppId, location: string): void {
  const option = getNavAppOption(appId);
  if (!option) return;
  const trimmed = location.trim();
  if (!trimmed) return;

  const url = option.getUrl(trimmed);
  const anchor = document.createElement('a');
  anchor.href = url;
  if (option.externalTab) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
