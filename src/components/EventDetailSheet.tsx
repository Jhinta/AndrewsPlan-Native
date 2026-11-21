import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Repeat,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CalendarEvent, EventMapProvider } from '../types/calendar';
import { formatDuration, formatTimeShort, isEventInProgress } from '../utils/dateUtils';
import {
  extractPhoneNumbers,
  getGoogleNavigationUrl,
  getWhatsAppUrl,
  isMappableLocation,
  linkifyPhoneSegments,
} from '../utils/eventLinks';
import { EventLocationMap } from './EventLocationMap';

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  showMapsView?: boolean;
  mapProvider?: EventMapProvider;
  onChangeMapProvider?: (provider: EventMapProvider) => void;
  onClose: () => void;
  onRequestDeleteGoogleEvent?: (event: CalendarEvent) => void;
  onRequestNavigate?: (location: string) => void;
}

function renderWithPhoneLinks(text: string): React.ReactNode {
  const segments = linkifyPhoneSegments(text);
  if (segments.length === 0) return text;
  return segments.map((seg, idx) =>
    seg.type === 'phone' ? (
      <a
        key={`${seg.href}-${idx}`}
        href={seg.href}
        className="font-medium text-blue-700 dark:text-blue-400 underline decoration-blue-400/60 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
      >
        {seg.value}
      </a>
    ) : (
      <React.Fragment key={`txt-${idx}`}>{seg.value}</React.Fragment>
    )
  );
}

export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({
  event,
  showMapsView = true,
  mapProvider,
  onChangeMapProvider,
  onClose,
  onRequestDeleteGoogleEvent,
  onRequestNavigate,
}) => {
  const [copiedLocation, setCopiedLocation] = useState(false);
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const swipeTouchRef = useRef<{
    x: number;
    y: number;
    time: number;
    axis: 'horizontal' | 'vertical' | null;
  } | null>(null);
  const swipeOffsetRef = useRef(0);
  const isDismissingRef = useRef(false);
  const suppressNextBackdropClickRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  const eventId = event?.id ?? null;

  useEffect(() => {
    setCopiedLocation(false);
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    swipeTouchRef.current = null;
    swipeOffsetRef.current = 0;
    isDismissingRef.current = false;
    suppressNextBackdropClickRef.current = false;
    setSwipeOffsetX(0);
    setIsSwiping(false);
    setIsDismissing(false);

    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eventId]);

  useEffect(() => {
    if (!overlayEl || !eventId) return;

    const handleNativeTouchMove = (e: TouchEvent) => {
      const start = swipeTouchRef.current;
      if (!start || e.touches.length !== 1 || isDismissingRef.current) return;

      const touch = e.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (start.axis === null) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
          start.axis = 'vertical';
          return;
        }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          start.axis = 'horizontal';
          setIsSwiping(true);
        } else {
          return;
        }
      }

      if (start.axis !== 'horizontal') return;

      if (e.cancelable) {
        e.preventDefault();
      }
      swipeOffsetRef.current = dx;
      setSwipeOffsetX(dx);
    };

    overlayEl.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => {
      overlayEl.removeEventListener('touchmove', handleNativeTouchMove);
    };
  }, [overlayEl, eventId]);

  const detectedPhones = useMemo(() => {
    if (!event) return [];
    if (event.phoneDisplay && event.phoneHref) {
      return [{
        display: event.phoneDisplay,
        href: event.phoneHref,
        normalized: event.phoneDisplay.replace(/\D/g, ''),
      }];
    }
    return extractPhoneNumbers([
      event.summary,
      event.location,
      event.description,
      event.organizer,
    ]);
  }, [event]);

  if (!event) return null;

  const isSwipeBlockedTarget = (target: EventTarget | null, root: HTMLElement): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('input, textarea, select, [data-no-swipe], .gm-style')) {
      return true;
    }
    let node: HTMLElement | null = target;
    while (node && node !== root) {
      if (node.scrollWidth > node.clientWidth + 4) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.touches.length !== 1 || isDismissingRef.current) {
      swipeTouchRef.current = null;
      return;
    }
    if (isSwipeBlockedTarget(e.target, e.currentTarget)) {
      swipeTouchRef.current = null;
      return;
    }
    const touch = e.touches[0];
    swipeTouchRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      axis: null,
    };
    swipeOffsetRef.current = 0;
  };

  const handleTouchEndOrCancel = (
    e: React.TouchEvent<HTMLDivElement>,
    cancelled: boolean
  ) => {
    e.stopPropagation();
    const start = swipeTouchRef.current;
    const offset = swipeOffsetRef.current;
    swipeTouchRef.current = null;

    if (!start || start.axis !== 'horizontal' || isDismissingRef.current) {
      setIsSwiping(false);
      if (swipeOffsetRef.current !== 0) {
        swipeOffsetRef.current = 0;
        setSwipeOffsetX(0);
      }
      return;
    }

    suppressNextBackdropClickRef.current = true;
    window.setTimeout(() => {
      suppressNextBackdropClickRef.current = false;
    }, 250);

    const endTouch = e.changedTouches[0];
    const dy = endTouch ? Math.abs(endTouch.clientY - start.y) : 0;
    const elapsed = Date.now() - start.time;
    const sheetWidth = sheetRef.current?.offsetWidth || window.innerWidth;
    const distanceThreshold = Math.min(110, sheetWidth * 0.28);
    const absOffset = Math.abs(offset);
    const isQuickFlick = elapsed <= 350 && absOffset >= 48 && dy <= 80;

    if (!cancelled && (absOffset >= distanceThreshold || isQuickFlick)) {
      isDismissingRef.current = true;
      setIsSwiping(false);
      setIsDismissing(true);
      const direction = offset < 0 ? -1 : 1;
      const exitX = direction * Math.max(window.innerWidth, sheetWidth + 48);
      swipeOffsetRef.current = exitX;
      setSwipeOffsetX(exitX);
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        onCloseRef.current();
      }, 160);
      return;
    }

    setIsSwiping(false);
    swipeOffsetRef.current = 0;
    setSwipeOffsetX(0);
  };

  const startDate = new Date(event.start);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(startDate);

  const timeRange = event.allDay
    ? 'All day'
    : `${formatTimeShort(event.start)} – ${formatTimeShort(event.end)}`;
  const duration = formatDuration(event.start, event.end, event.allDay);
  const inProgress = isEventInProgress(event);
  const canDeleteGoogle =
    event.source === 'google' &&
    Boolean(event.canEdit && event.calendarId && event.googleEventId && onRequestDeleteGoogleEvent);
  const navigationUrl = event.location ? getGoogleNavigationUrl(event.location) : null;

  const handleCopyLocation = async () => {
    if (!event.location) return;
    try {
      await navigator.clipboard.writeText(event.location);
      setCopiedLocation(true);
      window.setTimeout(() => setCopiedLocation(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const backdropFade = isDismissing
    ? 0
    : Math.max(0.15, 1 - Math.abs(swipeOffsetX) / 360);

  return (
    <div
      ref={setOverlayEl}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!suppressNextBackdropClickRef.current && !isDismissingRef.current) {
          onClose();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={(e) => handleTouchEndOrCancel(e, false)}
      onTouchCancel={(e) => handleTouchEndOrCancel(e, true)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/50 backdrop-blur-xs ${
          isSwiping ? 'transition-none' : 'transition-opacity duration-150 ease-out'
        }`}
        style={{ opacity: backdropFade }}
      />
      <div
        ref={sheetRef}
        className={`relative z-10 w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden touch-pan-y ${
          isSwiping
            ? 'transition-none'
            : isDismissing
            ? 'transition-transform duration-150 ease-in'
            : 'transition-transform duration-200 ease-out'
        }`}
        style={
          swipeOffsetX !== 0
            ? { transform: `translate3d(${swipeOffsetX}px, 0, 0)` }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="px-6 pt-4 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {event.source === 'google'
                ? `Google Calendar${event.calendarTitle ? ` · ${event.calendarTitle}` : ''}`
                : 'AndrewsPlan'}
              {inProgress ? ' · Happening now' : ''}
            </p>
            <h2
              id="event-detail-title"
              className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug break-words"
            >
              {renderWithPhoneLinks(event.summary)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event details"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="space-y-3.5 text-sm">
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{dateLabel}</p>
                <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                  {timeRange} · {duration}
                </p>
              </div>
            </div>

            {event.location && navigationUrl && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  {onRequestNavigate ? (
                    <button
                      type="button"
                      onClick={() => onRequestNavigate(event.location)}
                      className="text-left text-blue-700 dark:text-blue-400 font-medium underline decoration-blue-400/60 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 break-words"
                    >
                      {event.location}
                    </button>
                  ) : (
                    <a
                      href={navigationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 dark:text-blue-400 font-medium underline decoration-blue-400/60 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 break-words"
                    >
                      {event.location}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onRequestNavigate ? (
                    <button
                      type="button"
                      onClick={() => onRequestNavigate(event.location)}
                      aria-label="Choose navigation app"
                      className="min-h-[36px] px-2.5 flex items-center gap-1.5 rounded-lg bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Navigate</span>
                    </button>
                  ) : (
                    <a
                      href={navigationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Start Navigation"
                      className="min-h-[36px] px-2.5 flex items-center gap-1.5 rounded-lg bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Navigate</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleCopyLocation()}
                    className="min-h-[36px] px-2.5 flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    {copiedLocation ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {detectedPhones.length > 0 && (
              <div className="flex flex-col gap-2">
                {detectedPhones.map((phone) => {
                  const whatsAppUrl = getWhatsAppUrl(phone.normalized);
                  return (
                    <div key={phone.normalized} className="flex flex-wrap items-center gap-2">
                      <a
                        href={phone.href}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/80 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors font-mono tabular-nums"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{phone.display}</span>
                      </a>
                      {whatsAppUrl && (
                        <a
                          href={whatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`WhatsApp ${phone.display}`}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-xs font-semibold text-white transition-colors whitespace-nowrap shadow-xs"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {event.organizer && (
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-700 dark:text-slate-200 break-words">
                  Organizer: {renderWithPhoneLinks(event.organizer)}
                </p>
              </div>
            )}

            {event.isRecurring && (
              <div className="flex items-start gap-3">
                <Repeat className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-600 dark:text-slate-300">
                  Recurring calendar event
                </p>
              </div>
            )}

            {event.status && (
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-600 dark:text-slate-300">
                  Status: {event.status}
                  {event.categories.length > 0 ? ` · ${event.categories.join(', ')}` : ''}
                </p>
              </div>
            )}
          </div>

          {event.description && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Notes & Description
              </h3>
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed break-words">
                {renderWithPhoneLinks(event.description)}
              </div>
            </div>
          )}

          {(event.url || canDeleteGoogle) && (
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open event link</span>
                </a>
              )}

              {canDeleteGoogle && (
                <button
                  type="button"
                  onClick={() => onRequestDeleteGoogleEvent?.(event)}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100/80 dark:hover:bg-red-950/60 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete from Google Calendar</span>
                </button>
              )}
            </div>
          )}

          {event.location && navigationUrl && showMapsView && isMappableLocation(event.location) && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <EventLocationMap
                location={event.location}
                mapProvider={mapProvider}
                onChangeMapProvider={onChangeMapProvider}
                onRequestNavigate={onRequestNavigate}
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
