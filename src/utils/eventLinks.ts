export interface DetectedPhoneNumber {
  display: string;
  normalized: string;
  href: string;
}

export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'phone'; value: string; href: string };

// Matches international (+31..., 0031...) and local (06-..., 020..., (030)..., 555-...) phone candidates
const PHONE_CANDIDATE_REGEX = /(?<![A-Za-z0-9])(?:\+|00)?(?:\(?\d{1,4}\)?[\s.-]?){2,6}\d{2,6}(?![A-Za-z0-9])/g;

const DATE_LIKE_REGEX = /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})$/;

const EXPLICIT_PHONE_CONTEXT_REGEX =
  /(?:^|[\s([{"',;|])(?:tel(?:efoon)?(?:\s*(?:nummer|nr\.?))?|phone(?:\s*(?:no\.?|number))?|mob(?:iel|ile)?(?:\s*(?:nr\.?|nummer))?|gsm|call|bel|cell|whatsapp|fax)\s*[:.#=\-\s]*$/i;

const NON_PHONE_CONTEXT_REGEX =
  /(?:^|[\s([{"',;|])(?:contract(?:en|nummer|nummers|nr\.?|no\.?|number|id)?|contr\.?|agreement(?:\s*(?:no\.?|number|id))?|dossier(?:nummer|nr\.?)?|order(?:nummer|nr\.?|no\.?|id)?|werkbon(?:nummer|nr\.?)?|bon(?:nummer|nr\.?)?|factuur(?:nummer|nr\.?)?|invoice(?:\s*(?:no\.?|number|id))?|polis(?:nummer|nr\.?)?|referentie(?:nummer|nr\.?)?|ref\.?|kenmerk|klant(?:nummer|nr\.?)?|relatie(?:nummer|nr\.?)?|zaak(?:nummer|nr\.?)?|project(?:nummer|nr\.?)?|object(?:nummer|nr\.?)?|ticket(?:nummer|nr\.?)?|serienummer|serial(?:\s*(?:no\.?|number))?|po(?:\s*(?:no\.?|nr\.?|number))?|iban|kvk|btw|bsn|klant|client(?:\s*id)?|account(?:\s*(?:no\.?|nr\.?|number|id))?)\s*[:.#=\-\s]*$/i;

const GENERIC_ID_CONTEXT_REGEX =
  /(?:^|[\s([{"',;|])(?:nr\.?|no\.?|nummer|number|id|code|#)\s*[:.#=\-\s]*$/i;

const VIRTUAL_MEETING_HOST_REGEX =
  /(?:zoom\.us|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com|gotomeeting\.com|whereby\.com|discord\.gg)/i;

const VIRTUAL_ONLY_LABEL_REGEX =
  /^(?:online|remote|virtual|virtueel|zoom|teams|microsoft teams|ms teams|google meet|meet|webex|phone|telefoon|call|tbd|tba|n\/a|none|-+)$/i;

function isLikelyPhoneNumber(
  trimmed: string,
  digitsOnly: string,
  hasLeadingPlus: boolean,
  hasPhoneContext: boolean
): boolean {
  // Reject repeated identical digits like 00000000 or 11111111
  if (/^(\d)\1{7,}$/.test(digitsOnly)) {
    return false;
  }

  // International with '+' prefix (e.g. +31 6 12345678, +1 (555) 123-4567)
  if (hasLeadingPlus) {
    return /^[1-9]/.test(digitsOnly);
  }

  // International with '00' prefix requires at least 10 digits (rejects zero-padded contract IDs like 00123456)
  if (digitsOnly.startsWith('00')) {
    return digitsOnly.length >= 10 && /^00[1-9]/.test(digitsOnly);
  }

  // Explicit phone label immediately before candidate (e.g. "Tel: 020 555 1234")
  if (hasPhoneContext) {
    return true;
  }

  // Local phone numbers starting with 0 (e.g. 0612345678, 06-12345678, (030) 987-6543, 0800-1234)
  if (/^0[1-9]/.test(digitsOnly)) {
    const hasSeparators = /[\s().-]/.test(trimmed);
    if (digitsOnly.length === 10) return true;
    return hasSeparators && digitsOnly.length >= 8 && digitsOnly.length <= 11;
  }

  // Parenthesized area code or 3-3-4 formatted numbers (e.g. (555) 123-4567 or 555-123-4567)
  if (/^\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}$/.test(trimmed)) {
    return true;
  }
  if (/^\d{3}[-.\s]\d{3}[-.\s]\d{4}$/.test(trimmed)) {
    return true;
  }

  // Reject bare unprefixed digit groups and hyphenated IDs (e.g. 12345678, 2026-123456)
  return false;
}

export function normalizePhoneHref(
  raw: string,
  options?: { hasPhoneContext?: boolean }
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (DATE_LIKE_REGEX.test(trimmed)) return null;
  if (trimmed.includes(':') || trimmed.includes('/')) return null;

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  // Reject too-short numbers (e.g. postal codes / street numbers) or overly long numeric IDs
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return null;
  }

  // Reject plain unformatted 8-digit numbers that look like YYYYMMDD dates (e.g. 20261116)
  if (!hasLeadingPlus && digitsOnly.length === 8 && /^(?:19|20)\d{6}$/.test(digitsOnly)) {
    return null;
  }

  if (!isLikelyPhoneNumber(trimmed, digitsOnly, hasLeadingPlus, Boolean(options?.hasPhoneContext))) {
    return null;
  }

  const normalized = hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
  return `tel:${normalized}`;
}

export function linkifyPhoneSegments(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  PHONE_CANDIDATE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PHONE_CANDIDATE_REGEX.exec(text)) !== null) {
    const candidate = match[0];
    const start = match.index;
    const end = start + candidate.length;

    // Skip if tightly attached to ':', '/', or alphanumeric code prefix/suffix like C-12345678
    const prevChar = start > 0 ? text[start - 1] : '';
    const nextChar = end < text.length ? text[end] : '';
    if (prevChar === ':' || nextChar === ':' || prevChar === '/' || nextChar === '/') {
      continue;
    }
    if ((prevChar === '-' || prevChar === '_') && start >= 2 && /[A-Za-z]/.test(text[start - 2])) {
      continue;
    }
    if (nextChar === '-' && end + 1 < text.length && /[A-Za-z]/.test(text[end + 1])) {
      continue;
    }

    const precedingText = text.slice(Math.max(0, start - 48), start);
    if (NON_PHONE_CONTEXT_REGEX.test(precedingText)) {
      continue;
    }

    const hasPhoneContext = EXPLICIT_PHONE_CONTEXT_REGEX.test(precedingText);
    if (!hasPhoneContext && GENERIC_ID_CONTEXT_REGEX.test(precedingText)) {
      continue;
    }

    const href = normalizePhoneHref(candidate, { hasPhoneContext });
    if (!href) continue;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'phone', value: candidate.trim(), href });
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

export function extractPhoneNumbers(texts: Array<string | undefined | null>): DetectedPhoneNumber[] {
  const seen = new Set<string>();
  const results: DetectedPhoneNumber[] = [];

  for (const text of texts) {
    if (!text) continue;
    for (const seg of linkifyPhoneSegments(text)) {
      if (seg.type !== 'phone') continue;
      const normalized = seg.href.replace(/^tel:/, '');
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      results.push({
        display: seg.value,
        normalized,
        href: seg.href,
      });
    }
  }

  return results;
}

export function getWhatsAppUrl(phoneNumber: string): string | null {
  const trimmed = phoneNumber.trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;

  let waDigits = digits;
  if (!hasLeadingPlus) {
    if (digits.startsWith('00')) {
      waDigits = digits.slice(2);
    } else if (/^0[1-9]\d{6,10}$/.test(digits)) {
      // Convert local Dutch numbers (e.g. 0612345678 -> 31612345678) for wa.me links
      waDigits = `31${digits.slice(1)}`;
    }
  }

  return `https://wa.me/${waDigits}`;
}

export function getGoogleNavigationUrl(location: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location.trim())}`;
}

export function getWazeNavigationUrl(location: string): string {
  const coords = parseLatLngLocation(location);
  if (coords) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(location.trim())}&navigate=yes`;
}

export function getAppleMapsNavigationUrl(location: string): string {
  const coords = parseLatLngLocation(location);
  if (coords) {
    return `https://maps.apple.com/?daddr=${coords.lat},${coords.lng}`;
  }
  return `https://maps.apple.com/?daddr=${encodeURIComponent(location.trim())}`;
}

export function getGeoNavigationUrl(location: string): string {
  const coords = parseLatLngLocation(location);
  if (coords) {
    return `geo:${coords.lat},${coords.lng}?q=${coords.lat},${coords.lng}`;
  }
  return `geo:0,0?q=${encodeURIComponent(location.trim())}`;
}

export function getTomTomAndroidNavigationUrl(location: string): string {
  const trimmed = location.trim();
  const coords = parseLatLngLocation(trimmed);
  const geoTarget = coords
    ? `${coords.lat},${coords.lng}?q=${coords.lat},${coords.lng}`
    : `0,0?q=${encodeURIComponent(trimmed)}`;
  const playStoreFallback = encodeURIComponent(
    'https://play.google.com/store/apps/details?id=com.tomtom.gplay.navapp'
  );
  return `intent:${geoTarget}#Intent;scheme=geo;package=com.tomtom.gplay.navapp;action=android.intent.action.VIEW;S.browser_fallback_url=${playStoreFallback};end`;
}

export function parseLatLngLocation(location: string): { lat: number; lng: number } | null {
  const cleaned = location.trim().replace(/^geo:/i, '');
  const match = cleaned.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function isMappableLocation(location: string | undefined | null): boolean {
  const trimmed = location?.trim() ?? '';
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (VIRTUAL_MEETING_HOST_REGEX.test(trimmed) && !trimmed.includes(',')) return false;
  if (VIRTUAL_ONLY_LABEL_REGEX.test(trimmed)) return false;
  return true;
}
