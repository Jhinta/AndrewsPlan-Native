import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
} from '@vis.gl/react-google-maps';
import { Globe, Layers, Loader2, MapPin, Navigation } from 'lucide-react';
import type { EventMapProvider } from '../types/calendar';
import { getGoogleNavigationUrl, parseLatLngLocation } from '../utils/eventLinks';

interface EventLocationMapProps {
  location: string;
  mapProvider?: EventMapProvider;
  onChangeMapProvider?: (provider: EventMapProvider) => void;
  onRequestNavigate?: (location: string) => void;
}

interface GeocodedPoint {
  lat: number;
  lng: number;
  formattedAddress: string;
}

type GoogleMapViewType = 'satellite' | 'hybrid' | 'roadmap';

const SESSION_GEOCODE_CACHE: Record<string, GeocodedPoint> = {};
let cachedRuntimeApiKey: string | null = null;

function resolveApiUrl(path: string): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) {
    return `${configured.replace(/\/$/, '')}${path}`;
  }
  return path;
}

function getEnvMapsApiKey(): string {
  return ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '').trim();
}

const MapStatusObserver: React.FC<{ onFailure: () => void }> = ({ onFailure }) => {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      onFailure();
    } else if (status === APILoadingStatus.FAILED) {
      onFailure();
    }
  }, [status, onFailure]);

  return null;
};

const OpenStreetMapCanvas: React.FC<{ point: GeocodedPoint }> = ({ point }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [point.lat, point.lng],
      zoom: 16,
      scrollWheelZoom: false,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:36px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));"><svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#1D4ED8"/><circle cx="14" cy="14" r="5.5" fill="#FFFFFF"/></svg></div>`,
      iconSize: [28, 36],
      iconAnchor: [14, 35],
      popupAnchor: [0, -32],
    });

    const marker = L.marker([point.lat, point.lng], { icon: pinIcon }).addTo(map);
    const popupContent = document.createElement('div');
    popupContent.className = 'text-xs font-medium text-slate-800 max-w-[200px]';
    popupContent.textContent = point.formattedAddress;
    marker.bindPopup(popupContent);

    const rafId = window.requestAnimationFrame(() => map.invalidateSize());
    const timerId = window.setTimeout(() => map.invalidateSize(), 200);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      map.remove();
    };
  }, [point.lat, point.lng, point.formattedAddress]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export const EventLocationMap: React.FC<EventLocationMapProps> = ({
  location,
  mapProvider,
  onChangeMapProvider,
  onRequestNavigate,
}) => {
  const [internalProvider, setInternalProvider] = useState<EventMapProvider>('osm');
  const activeProvider = mapProvider ?? internalProvider;
  const setProvider = (next: EventMapProvider) => {
    setInternalProvider(next);
    onChangeMapProvider?.(next);
  };

  const [apiKey, setApiKey] = useState<string>(() => getEnvMapsApiKey() || cachedRuntimeApiKey || '');
  const [coords, setCoords] = useState<GeocodedPoint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapType, setMapType] = useState<GoogleMapViewType>('satellite');

  useEffect(() => {
    let cancelled = false;
    const trimmed = location.trim();

    setMapFailed(false);
    setErrorMessage(null);

    if (!trimmed) {
      setCoords(null);
      setIsLoading(false);
      return;
    }

    const loadMapData = async () => {
      setIsLoading(true);

      const direct = parseLatLngLocation(trimmed);
      if (direct) {
        if (activeProvider === 'google' && !(getEnvMapsApiKey() || cachedRuntimeApiKey)) {
          try {
            const cfgRes = await fetch(resolveApiUrl('/api/maps/config'));
            if (cfgRes.ok) {
              const cfg = (await cfgRes.json().catch(() => ({}))) as { apiKey?: string };
              if (cfg.apiKey) {
                cachedRuntimeApiKey = cfg.apiKey;
              }
            }
          } catch {
            // Ignore config error
          }
        }
        if (cancelled) return;
        setApiKey(getEnvMapsApiKey() || cachedRuntimeApiKey || '');
        setCoords({
          lat: direct.lat,
          lng: direct.lng,
          formattedAddress: trimmed,
        });
        setIsLoading(false);
        return;
      }

      const cacheKey = trimmed.toLowerCase();

      if (activeProvider === 'osm') {
        if (SESSION_GEOCODE_CACHE[cacheKey]) {
          setCoords(SESSION_GEOCODE_CACHE[cacheKey]);
          setIsLoading(false);
          return;
        }

        try {
          let lat: number | undefined;
          let lng: number | undefined;
          let formattedAddress: string | undefined;

          // 1. Direct Nominatim geocode (works in native app without backend proxy)
          try {
            const nomRes = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(trimmed)}`,
              { headers: { 'User-Agent': 'AndrewsPlan/1.0' } }
            );
            if (nomRes.ok) {
              const nomData = await nomRes.json();
              if (Array.isArray(nomData) && nomData.length > 0 && nomData[0].lat && nomData[0].lon) {
                lat = parseFloat(nomData[0].lat);
                lng = parseFloat(nomData[0].lon);
                formattedAddress = nomData[0].display_name;
              }
            }
          } catch {
            // Fallback to proxy
          }

          // 2. Fallback to proxy if direct Nominatim failed
          if (lat === undefined || lng === undefined) {
            const res = await fetch(
              resolveApiUrl(`/api/maps/osm-geocode?address=${encodeURIComponent(trimmed)}`)
            );
            const payload = (await res.json().catch(() => ({}))) as {
              lat?: number;
              lng?: number;
              formattedAddress?: string;
              error?: string;
            };
            if (res.ok && typeof payload.lat === 'number' && typeof payload.lng === 'number') {
              lat = payload.lat;
              lng = payload.lng;
              formattedAddress = payload.formattedAddress;
            }
          }

          if (cancelled) return;

          if (lat === undefined || lng === undefined) {
            setErrorMessage('Unable to pinpoint address on OpenStreetMap.');
            setCoords(null);
            setIsLoading(false);
            return;
          }

          const resolvedPoint: GeocodedPoint = {
            lat,
            lng,
            formattedAddress: formattedAddress || trimmed,
          };
          SESSION_GEOCODE_CACHE[cacheKey] = resolvedPoint;
          setCoords(resolvedPoint);
          setIsLoading(false);
        } catch {
          if (!cancelled) {
            setErrorMessage('Unable to load OpenStreetMap right now.');
            setIsLoading(false);
          }
        }
        return;
      }

      // Google Maps provider
      let resolvedKey = getEnvMapsApiKey() || cachedRuntimeApiKey || '';
      if (!resolvedKey) {
        try {
          const cfgRes = await fetch(resolveApiUrl('/api/maps/config'));
          if (cfgRes.ok) {
            const cfg = (await cfgRes.json().catch(() => ({}))) as { apiKey?: string };
            if (cfg.apiKey) {
              cachedRuntimeApiKey = cfg.apiKey;
              resolvedKey = cfg.apiKey;
            }
          }
        } catch {
          // Ignore config fetch failure; handled below
        }
      }

      if (cancelled) return;
      setApiKey(resolvedKey);

      if (!resolvedKey) {
        setErrorMessage('Google Maps API key is not configured. Switch to OpenStreetMap to view this address.');
        setIsLoading(false);
        return;
      }

      if (SESSION_GEOCODE_CACHE[cacheKey]) {
        setCoords(SESSION_GEOCODE_CACHE[cacheKey]);
        setIsLoading(false);
        return;
      }

      try {
        let lat: number | undefined;
        let lng: number | undefined;
        let formattedAddress: string | undefined;

        // Try proxy geocode endpoint first
        try {
          const res = await fetch(
            resolveApiUrl(`/api/maps/geocode?address=${encodeURIComponent(trimmed)}`)
          );
          const payload = (await res.json().catch(() => ({}))) as {
            lat?: number;
            lng?: number;
            formattedAddress?: string;
            status?: string;
            error?: string | { status?: string; message?: string };
          };

          if (
            res.status === 429 ||
            (typeof payload.error === 'object' && payload.error?.status === 'RESOURCE_EXHAUSTED') ||
            payload.status === 'OVER_QUERY_LIMIT'
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            setErrorMessage('Google Maps quota reached. Switch to OpenStreetMap or Navigate.');
            setIsLoading(false);
            return;
          }

          if (res.ok && typeof payload.lat === 'number' && typeof payload.lng === 'number') {
            lat = payload.lat;
            lng = payload.lng;
            formattedAddress = payload.formattedAddress;
          }
        } catch {
          // Proxy endpoint unavailable
        }

        // Fallback: use Nominatim to find coordinates so Google Maps can render the marker
        if (lat === undefined || lng === undefined) {
          try {
            const nomRes = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(trimmed)}`,
              { headers: { 'User-Agent': 'AndrewsPlan/1.0' } }
            );
            if (nomRes.ok) {
              const nomData = await nomRes.json();
              if (Array.isArray(nomData) && nomData.length > 0 && nomData[0].lat && nomData[0].lon) {
                lat = parseFloat(nomData[0].lat);
                lng = parseFloat(nomData[0].lon);
                formattedAddress = nomData[0].display_name;
              }
            }
          } catch {
            // Geocoding failed
          }
        }

        if (cancelled) return;

        if (lat === undefined || lng === undefined) {
          setErrorMessage('Unable to pinpoint address on map.');
          setCoords(null);
          setIsLoading(false);
          return;
        }

        const resolvedPoint: GeocodedPoint = {
          lat,
          lng,
          formattedAddress: formattedAddress || trimmed,
        };
        SESSION_GEOCODE_CACHE[cacheKey] = resolvedPoint;
        setCoords(resolvedPoint);
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setErrorMessage('Unable to load map right now.');
          setIsLoading(false);
        }
      }
    };

    void loadMapData();
    return () => {
      cancelled = true;
    };
  }, [location, activeProvider]);

  const navigationUrl = getGoogleNavigationUrl(location);
  const showGoogleMissingOrFailed =
    activeProvider === 'google' && (mapFailed || Boolean(errorMessage) || !coords || !apiKey);
  const showOsmMissingOrFailed = activeProvider === 'osm' && (Boolean(errorMessage) || !coords);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-0 shrink-0">
          <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate">{activeProvider === 'osm' ? 'OpenStreetMap' : 'Google Maps'}</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-medium shrink-0">
          <button
            type="button"
            onClick={() => setProvider('osm')}
            className={`px-2 py-1 rounded-md transition-colors ${
              activeProvider === 'osm'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            OSM
          </button>
          {(
            [
              { id: 'satellite', label: 'Satellite' },
              { id: 'hybrid', label: 'Labels' },
              { id: 'roadmap', label: 'Map' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setProvider('google');
                setMapType(mode.id);
              }}
              className={`px-2 py-1 rounded-md transition-colors ${
                activeProvider === 'google' && mapType === mode.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div
        data-no-swipe="true"
        className="w-full h-52 sm:h-60 relative isolate bg-slate-100 dark:bg-slate-900"
      >
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
            <span>
              {activeProvider === 'osm' ? 'Loading OpenStreetMap…' : 'Loading map view…'}
            </span>
          </div>
        ) : showGoogleMissingOrFailed || showOsmMissingOrFailed ? (
          <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center gap-2.5">
            <MapPin className="w-5 h-5 text-slate-400" />
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs">
              {errorMessage || 'Map could not be displayed for this location.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {activeProvider === 'google' && (
                <button
                  type="button"
                  onClick={() => setProvider('osm')}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Use OpenStreetMap</span>
                </button>
              )}
              {onRequestNavigate ? (
                <button
                  type="button"
                  onClick={() => onRequestNavigate(location)}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Navigate</span>
                </button>
              ) : (
                <a
                  href={navigationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Navigate</span>
                </a>
              )}
            </div>
          </div>
        ) : activeProvider === 'osm' && coords ? (
          <OpenStreetMapCanvas point={coords} />
        ) : coords && apiKey ? (
          <APIProvider apiKey={apiKey}>
            <MapStatusObserver onFailure={() => setMapFailed(true)} />
            <GoogleMap
              key={`${coords.lat},${coords.lng}`}
              mapId="DEMO_MAP_ID"
              mapTypeId={mapType}
              defaultCenter={{ lat: coords.lat, lng: coords.lng }}
              defaultZoom={17}
              gestureHandling="cooperative"
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={true}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <AdvancedMarker
                position={{ lat: coords.lat, lng: coords.lng }}
                title={coords.formattedAddress}
              >
                <Pin />
              </AdvancedMarker>
            </GoogleMap>
          </APIProvider>
        ) : null}
      </div>
    </div>
  );
};

