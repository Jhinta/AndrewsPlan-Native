import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ical from 'node-ical';
import type { VEvent, ParameterValue, VCalendar } from 'node-ical';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLOUDPLAN_ICS_URL = 'https://cloudplan.nl/ics';
const PORT = Number(process.env.PORT) || 3000;

interface NormalizedEvent {
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
  phoneDisplay?: string;
  phoneHref?: string;
}

function unwrapParamValue(value: ParameterValue | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && 'val' in value && typeof value.val === 'string') {
    return value.val.trim();
  }
  return String(value).trim();
}

function unwrapOrganizer(org: unknown): string {
  if (!org) return '';
  if (typeof org === 'string') {
    return org.replace(/^mailto:/i, '').trim();
  }
  if (typeof org === 'object' && org !== null) {
    const obj = org as { params?: { CN?: string }; val?: string };
    const cn = obj.params?.CN?.trim();
    const val = obj.val?.replace(/^mailto:/i, '').trim();
    if (cn && val && cn !== val) return `${cn} (${val})`;
    return cn || val || '';
  }
  return '';
}

function unwrapCategories(cats: unknown): string[] {
  if (!cats) return [];
  if (Array.isArray(cats)) {
    return cats.map((c) => unwrapParamValue(c as ParameterValue)).filter(Boolean);
  }
  if (typeof cats === 'string') {
    return cats
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseCalendarEvents(icsBody: string): { calendarName: string; events: NormalizedEvent[] } {
  const parsed = ical.sync.parseICS(icsBody);

  let calendarName = 'AndrewsPlan Schedule';
  const vcal = parsed.vcalendar as (VCalendar & Record<string, unknown>) | undefined;
  if (vcal) {
    const wrCalName =
      unwrapParamValue(vcal['WR-CALNAME'] as ParameterValue | undefined) ||
      unwrapParamValue(vcal['X-WR-CALNAME'] as ParameterValue | undefined);
    if (wrCalName) {
      calendarName = wrCalName;
    }
  }

  const now = new Date();
  const rangeFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const rangeTo = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const events: NormalizedEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!component || typeof component !== 'object' || !('type' in component)) continue;
    if (component.type !== 'VEVENT') continue;

    const vevent = component as VEvent;
    if (!vevent.start) continue;

    try {
      const instances = ical.expandRecurringEvent(vevent, {
        from: rangeFrom,
        to: rangeTo,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
        maxIterations: 2000,
      });

      for (const instance of instances) {
        const startDate = instance.start instanceof Date ? instance.start : new Date(instance.start);
        const endDate = instance.end instanceof Date ? instance.end : new Date(startDate.getTime() + 60 * 60 * 1000);

        if (Number.isNaN(startDate.getTime())) continue;
        const safeEnd = Number.isNaN(endDate.getTime())
          ? new Date(startDate.getTime() + 60 * 60 * 1000)
          : endDate;

        const baseUid = unwrapParamValue(instance.event.uid) || `${startDate.getTime()}`;
        const summary =
          unwrapParamValue(instance.summary) ||
          unwrapParamValue(instance.event.summary) ||
          'Untitled Event';

        events.push({
          id: `${baseUid}::${startDate.toISOString()}`,
          uid: baseUid,
          summary,
          description: unwrapParamValue(instance.event.description),
          location: unwrapParamValue(instance.event.location),
          start: startDate.toISOString(),
          end: safeEnd.toISOString(),
          allDay: Boolean(instance.isFullDay),
          isRecurring: Boolean(instance.isRecurring),
          status: unwrapParamValue(instance.event.status),
          organizer: unwrapOrganizer(instance.event.organizer),
          categories: unwrapCategories(instance.event.categories),
          url: unwrapParamValue(instance.event.url),
        });
      }
    } catch {
      // Fallback to single instance if an exotic RRULE fails expansion
      const startDate = vevent.start instanceof Date ? vevent.start : new Date(vevent.start);
      if (Number.isNaN(startDate.getTime())) continue;
      const endDate = vevent.end instanceof Date ? vevent.end : new Date(startDate.getTime() + 60 * 60 * 1000);
      const baseUid = unwrapParamValue(vevent.uid) || `${startDate.getTime()}`;
      const isFullDay = (vevent as unknown as { datetype?: string }).datetype === 'date';

      events.push({
        id: `${baseUid}::${startDate.toISOString()}`,
        uid: baseUid,
        summary: unwrapParamValue(vevent.summary) || 'Untitled Event',
        description: unwrapParamValue(vevent.description),
        location: unwrapParamValue(vevent.location),
        start: startDate.toISOString(),
        end: Number.isNaN(endDate.getTime()) ? startDate.toISOString() : endDate.toISOString(),
        allDay: isFullDay,
        isRecurring: Boolean(vevent.rrule),
        status: unwrapParamValue(vevent.status),
        organizer: unwrapOrganizer(vevent.organizer),
        categories: unwrapCategories(vevent.categories),
        url: unwrapParamValue(vevent.url),
      });
    }
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { calendarName, events };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin === 'https://localhost' || origin === 'capacitor://localhost' || origin === 'http://localhost')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'andrewsplan-ics-proxy' });
  });

  const geocodeCache = new Map<
    string,
    { lat: number; lng: number; formattedAddress: string; placeId?: string; cachedAt: number }
  >();
  const GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000;

  function getServerMapsApiKey(): string {
    return (process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
  }

  app.get('/api/maps/config', (_req, res) => {
    const apiKey = getServerMapsApiKey();
    res.json({ apiKey });
  });

  app.get('/api/maps/geocode', async (req, res) => {
    const rawAddress = typeof req.query.address === 'string' ? req.query.address.trim() : '';
    if (!rawAddress || rawAddress.length > 500) {
      res.status(400).json({ error: 'A valid address query parameter is required.' });
      return;
    }

    const cacheKey = rawAddress.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < GEOCODE_CACHE_TTL_MS) {
      res.json({
        lat: cached.lat,
        lng: cached.lng,
        formattedAddress: cached.formattedAddress,
        placeId: cached.placeId,
      });
      return;
    }

    const apiKey = getServerMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key is not configured on server.' });
      return;
    }

    const rememberGeocode = (entry: {
      lat: number;
      lng: number;
      formattedAddress: string;
      placeId?: string;
    }) => {
      if (geocodeCache.size >= 250) {
        const oldestKey = geocodeCache.keys().next().value;
        if (oldestKey) geocodeCache.delete(oldestKey);
      }
      geocodeCache.set(cacheKey, { ...entry, cachedAt: Date.now() });
    };

    try {
      // Primary: Geocoding API v4 REST endpoint
      const v4Url = `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(rawAddress)}`;
      const v4Res = await fetch(v4Url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'results.location,results.formattedAddress,results.placeId',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        signal: AbortSignal.timeout(10000),
      });

      const v4Body = (await v4Res.json().catch(() => ({}))) as {
        results?: Array<{
          location?: { latitude?: number; longitude?: number };
          formattedAddress?: string;
          placeId?: string;
        }>;
        error?: { code?: number; status?: string; message?: string };
      };

      if (v4Res.status === 429 || v4Body.error?.status === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message: v4Body.error?.message || 'Google Maps Platform quota reached.',
          },
        });
        return;
      }

      if (v4Res.ok) {
        const first = v4Body.results?.[0];
        const lat = first?.location?.latitude;
        const lng = first?.location?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          const result = {
            lat,
            lng,
            formattedAddress: first?.formattedAddress || rawAddress,
            placeId: first?.placeId,
          };
          rememberGeocode(result);
          res.json(result);
          return;
        }
        res.status(404).json({ error: 'Address could not be located on Google Maps.' });
        return;
      }

      // Fallback: Standard Geocoding REST JSON API (maps.googleapis.com)
      const legacyUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawAddress)}&key=${encodeURIComponent(apiKey)}`;
      const geoRes = await fetch(legacyUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      const geoBody = (await geoRes.json().catch(() => ({}))) as {
        status?: string;
        error_message?: string;
        results?: Array<{
          formatted_address?: string;
          place_id?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
        }>;
      };

      if (geoRes.status === 429 || geoBody.status === 'OVER_QUERY_LIMIT') {
        res.status(429).json({
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message: geoBody.error_message || 'Google Maps Platform quota reached.',
          },
        });
        return;
      }

      if (geoBody.status === 'ZERO_RESULTS') {
        res.status(404).json({ error: 'Address could not be located on Google Maps.' });
        return;
      }

      if (geoBody.status === 'OK') {
        const first = geoBody.results?.[0];
        const lat = first?.geometry?.location?.lat;
        const lng = first?.geometry?.location?.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
          const result = {
            lat,
            lng,
            formattedAddress: first?.formatted_address || rawAddress,
            placeId: first?.place_id,
          };
          rememberGeocode(result);
          res.json(result);
          return;
        }
      }

      res.status(502).json({
        error: geoBody.error_message || v4Body.error?.message || 'Unable to geocode location.',
      });
    } catch {
      res.status(502).json({ error: 'Unable to reach Google Maps geocoding service.' });
    }
  });

  const osmGeocodeCache = new Map<
    string,
    { lat: number; lng: number; formattedAddress: string; cachedAt: number }
  >();

  app.get('/api/maps/osm-geocode', async (req, res) => {
    const rawAddress = typeof req.query.address === 'string' ? req.query.address.trim() : '';
    if (!rawAddress || rawAddress.length > 500) {
      res.status(400).json({ error: 'A valid address query parameter is required.' });
      return;
    }

    const cacheKey = rawAddress.toLowerCase();
    const cached = osmGeocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < GEOCODE_CACHE_TTL_MS) {
      res.json({
        lat: cached.lat,
        lng: cached.lng,
        formattedAddress: cached.formattedAddress,
      });
      return;
    }

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(rawAddress)}`;
      const osmRes = await fetch(nominatimUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AndrewsPlan/1.0 (+https://andrewsplan.app)',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!osmRes.ok) {
        res.status(502).json({ error: 'OpenStreetMap geocoding service is currently unavailable.' });
        return;
      }

      const results = (await osmRes.json().catch(() => [])) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
      }>;

      const first = Array.isArray(results) ? results[0] : undefined;
      const lat = first?.lat ? Number.parseFloat(first.lat) : Number.NaN;
      const lng = first?.lon ? Number.parseFloat(first.lon) : Number.NaN;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        res.status(404).json({ error: 'Address could not be located on OpenStreetMap.' });
        return;
      }

      const resolved = {
        lat,
        lng,
        formattedAddress: first?.display_name || rawAddress,
      };

      if (osmGeocodeCache.size >= 250) {
        const oldestKey = osmGeocodeCache.keys().next().value;
        if (oldestKey) osmGeocodeCache.delete(oldestKey);
      }
      osmGeocodeCache.set(cacheKey, { ...resolved, cachedAt: Date.now() });

      res.json(resolved);
    } catch {
      res.status(502).json({ error: 'Unable to reach OpenStreetMap geocoding service.' });
    }
  });

  app.post('/api/ics/sync', async (req, res) => {
    const body = (req.body ?? {}) as {
      username?: unknown;
      password?: unknown;
    };

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    if (username.toLowerCase() === 'demo' && password.toLowerCase() === 'demo') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const demoEvents: NormalizedEvent[] = [
        {
          id: 'demo-ev-1',
          uid: 'demo-ev-1',
          summary: 'Morning Sync & Planning',
          description: 'Review weekly agenda, sprint backlog, and Android Auto integration progress.',
          location: 'CloudPlan HQ, Keizersgracht 123, Amsterdam',
          start: new Date(startOfToday + 9 * 3600000).toISOString(),
          end: new Date(startOfToday + 9 * 3600000 + 45 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'demo@cloudplan.nl',
          categories: ['Work'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-2',
          uid: 'demo-ev-2',
          summary: 'Client Lunch Meeting',
          description: 'Discuss project milestones, deliverables, and Q3 extension over lunch.',
          location: 'Grand Café De Jaren, Doelenstraat 20, Amsterdam',
          start: new Date(startOfToday + 12 * 3600000 + 30 * 60000).toISOString(),
          end: new Date(startOfToday + 13 * 3600000 + 30 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'client@company.com',
          categories: ['Meeting'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-3',
          uid: 'demo-ev-3',
          summary: 'Android Auto Live Demo',
          description: 'Showcase native Android Auto POI templates and voice controls to stakeholders.',
          location: 'https://meet.google.com/abc-demo-xyz',
          start: new Date(startOfToday + 15 * 3600000).toISOString(),
          end: new Date(startOfToday + 16 * 3600000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'product@cloudplan.nl',
          categories: ['Demo'],
          url: 'https://meet.google.com/abc-demo-xyz',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-4',
          uid: 'demo-ev-4',
          summary: 'On-site Technical Workshop',
          description: 'Interactive session on mobile architecture and car app design standards.',
          location: 'High Tech Campus 1, Eindhoven',
          start: new Date(startOfToday + 24 * 3600000 + 10 * 3600000).toISOString(),
          end: new Date(startOfToday + 24 * 3600000 + 12 * 3600000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'workshop@hightechcampus.com',
          categories: ['Workshop'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-5',
          uid: 'demo-ev-5',
          summary: 'Team Strategy Dinner',
          description: 'Quarterly team dinner and celebration for successful mobile release.',
          location: 'Baden Powelllaan 2, Rotterdam',
          start: new Date(startOfToday + 24 * 3600000 + 18 * 3600000 + 30 * 60000).toISOString(),
          end: new Date(startOfToday + 24 * 3600000 + 20 * 3600000 + 30 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'events@cloudplan.nl',
          categories: ['Social'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-6',
          uid: 'demo-ev-6',
          summary: 'Architecture Review',
          description: 'Evaluate database sync performance and background worker lifecycle.',
          location: 'https://teams.microsoft.com/l/meetup-join/demo',
          start: new Date(startOfToday + 2 * 24 * 3600000 + 11 * 3600000).toISOString(),
          end: new Date(startOfToday + 2 * 24 * 3600000 + 12 * 3600000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'tech-lead@cloudplan.nl',
          categories: ['Review'],
          url: 'https://teams.microsoft.com/l/meetup-join/demo',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-7',
          uid: 'demo-ev-7',
          summary: 'Customer Support Catch-up',
          description: 'Review feedback from Android Auto users and prioritize bug fixes.',
          location: 'Phone Call',
          start: new Date(startOfToday + 2 * 24 * 3600000 + 14 * 3600000 + 30 * 60000).toISOString(),
          end: new Date(startOfToday + 2 * 24 * 3600000 + 15 * 3600000 + 15 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'support@cloudplan.nl',
          categories: ['Support'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-8',
          uid: 'demo-ev-8',
          summary: 'Mobile UX Design Sprint',
          description: 'Design sprint focused on car screen ergonomics and high-contrast night mode.',
          location: 'Stationsplein 45, Utrecht',
          start: new Date(startOfToday + 3 * 24 * 3600000 + 9 * 3600000 + 30 * 60000).toISOString(),
          end: new Date(startOfToday + 3 * 24 * 3600000 + 11 * 3600000 + 30 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'ux@cloudplan.nl',
          categories: ['Design'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-9',
          uid: 'demo-ev-9',
          summary: 'Weekly Operations Sync',
          description: 'Operational review, resource allocation, and timeline check.',
          location: 'https://zoom.us/j/demo123456',
          start: new Date(startOfToday + 3 * 24 * 3600000 + 16 * 3600000).toISOString(),
          end: new Date(startOfToday + 3 * 24 * 3600000 + 17 * 3600000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'ops@cloudplan.nl',
          categories: ['Ops'],
          url: 'https://zoom.us/j/demo123456',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-10',
          uid: 'demo-ev-10',
          summary: 'Security & Compliance Audit',
          description: 'Annual audit covering credential storage, TLS verification, and host validation.',
          location: 'Beatrixlaan 800, The Hague',
          start: new Date(startOfToday + 4 * 24 * 3600000 + 13 * 3600000).toISOString(),
          end: new Date(startOfToday + 4 * 24 * 3600000 + 14 * 3600000 + 30 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'security@cloudplan.nl',
          categories: ['Security'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-11',
          uid: 'demo-ev-11',
          summary: 'Weekend Hackathon & Innovations',
          description: 'Prototyping AI features and voice shortcuts for driver convenience.',
          location: 'Science Park 904, Amsterdam',
          start: new Date(startOfToday + 5 * 24 * 3600000 + 11 * 3600000).toISOString(),
          end: new Date(startOfToday + 5 * 24 * 3600000 + 17 * 3600000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'hackathon@cloudplan.nl',
          categories: ['Hackathon'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
        {
          id: 'demo-ev-12',
          uid: 'demo-ev-12',
          summary: 'Weekly Retrospective & Planning',
          description: 'Sprint retro, celebrate accomplishments, and plan tasks for the upcoming week.',
          location: 'CloudPlan HQ, Keizersgracht 123, Amsterdam',
          start: new Date(startOfToday + 6 * 24 * 3600000 + 10 * 3600000).toISOString(),
          end: new Date(startOfToday + 6 * 24 * 3600000 + 11 * 3600000 + 30 * 60000).toISOString(),
          allDay: false,
          isRecurring: false,
          status: 'CONFIRMED',
          organizer: 'demo@cloudplan.nl',
          categories: ['Planning'],
          url: '',
          phoneDisplay: '0800 5200200',
          phoneHref: 'tel:08005200200',
        },
      ];

      res.json({
        calendarName: 'AndrewsPlan Demo',
        sourceUrl: 'demo://cloudplan',
        syncedAt: new Date().toISOString(),
        eventCount: demoEvents.length,
        events: demoEvents,
      });
      return;
    }

    const authHeader = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;

    try {
      const upstream = await fetch(CLOUDPLAN_ICS_URL, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
          'User-Agent': 'AndrewsPlan/1.0',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (upstream.status === 401 || upstream.status === 403) {
        res.status(401).json({
          error: 'Authentication failed. Verify your AndrewsPlan username and password.',
        });
        return;
      }

      if (!upstream.ok) {
        res.status(502).json({
          error: `AndrewsPlan returned HTTP ${upstream.status} (${upstream.statusText || 'Error'}).`,
        });
        return;
      }

      const icsText = await upstream.text();
      if (!icsText.includes('BEGIN:VCALENDAR')) {
        res.status(502).json({
          error: 'AndrewsPlan response did not contain a valid iCalendar (VCALENDAR) feed.',
        });
        return;
      }

      const { calendarName, events } = parseCalendarEvents(icsText);

      res.json({
        calendarName,
        sourceUrl: CLOUDPLAN_ICS_URL,
        syncedAt: new Date().toISOString(),
        eventCount: events.length,
        events,
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      res.status(isTimeout ? 504 : 502).json({
        error: isTimeout
          ? 'Connection to AndrewsPlan timed out after 15 seconds.'
          : 'Unable to reach AndrewsPlan. Check network connectivity and try again.',
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AndrewsPlan server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
