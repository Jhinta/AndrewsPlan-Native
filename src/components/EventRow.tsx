import React, { useMemo } from 'react';
import { ChevronRight, MapPin, Phone, Repeat } from 'lucide-react';
import type { CalendarEvent } from '../types/calendar';
import { formatDuration, formatTimeShort, isEventInProgress, isEventPast } from '../utils/dateUtils';
import { extractPhoneNumbers, getGoogleNavigationUrl } from '../utils/eventLinks';

interface EventRowProps {
  event: CalendarEvent;
  nowMs: number;
  isSelected: boolean;
  onSelect: (event: CalendarEvent) => void;
  onRequestNavigate?: (location: string) => void;
}

export const EventRow: React.FC<EventRowProps> = ({
  event,
  nowMs,
  isSelected,
  onSelect,
  onRequestNavigate,
}) => {
  const inProgress = isEventInProgress(event, nowMs);
  const past = isEventPast(event, nowMs);
  const startLabel = event.allDay ? 'All day' : formatTimeShort(event.start);
  const endLabel = event.allDay ? '' : formatTimeShort(event.end);
  const durationLabel = formatDuration(event.start, event.end, event.allDay);

  const primaryPhone = useMemo(() => {
    if (event.phoneDisplay && event.phoneHref) {
      return { display: event.phoneDisplay, href: event.phoneHref, normalized: event.phoneDisplay.replace(/\D/g, '') };
    }
    const found = extractPhoneNumbers([event.summary, event.location, event.description]);
    return found[0] ?? null;
  }, [event.phoneDisplay, event.phoneHref, event.summary, event.location, event.description]);

  const navigationUrl = event.location ? getGoogleNavigationUrl(event.location) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(event);
        }
      }}
      className={`w-full text-left min-h-[68px] px-4 py-3.5 flex items-center gap-4 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600 ${
        isSelected
          ? 'bg-blue-50/80 dark:bg-blue-950/35'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800'
      }`}
    >
      {/* Tabular Time Column */}
      <div className="w-14 shrink-0 flex flex-col justify-center font-mono tabular-nums">
        <span
          className={`text-sm font-semibold leading-tight ${
            inProgress
              ? 'text-blue-700 dark:text-blue-400'
              : past
              ? 'text-slate-400 dark:text-slate-500'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {startLabel}
        </span>
        {endLabel && (
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
            {endLabel}
          </span>
        )}
      </div>

      {/* Event Summary & Clean Unboxed Metadata */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={`text-[15px] font-semibold leading-snug truncate ${
              past
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {event.summary}
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {inProgress && (
            <>
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                In progress
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="font-mono tabular-nums">{durationLabel}</span>
          {event.categories.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                {event.categories.join(', ')}
              </span>
            </>
          )}
          {event.source === 'google' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate max-w-[140px]">
                {event.calendarTitle ? `Google · ${event.calendarTitle}` : 'Google Calendar'}
              </span>
            </>
          )}
          {event.location && navigationUrl && (
            <>
              <span aria-hidden="true">·</span>
              {onRequestNavigate ? (
                <button
                  type="button"
                  title={`Navigate to ${event.location}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestNavigate(event.location);
                  }}
                  className="inline-flex items-center gap-1 min-w-0 truncate max-w-[200px] sm:max-w-[280px] text-blue-700 dark:text-blue-400 hover:underline underline-offset-2 text-left"
                >
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </button>
              ) : (
                <a
                  href={navigationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Start Navigation to ${event.location}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 min-w-0 truncate max-w-[200px] sm:max-w-[280px] text-blue-700 dark:text-blue-400 hover:underline underline-offset-2"
                >
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </a>
              )}
            </>
          )}
          {primaryPhone && (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={primaryPhone.href}
                title={`Call ${primaryPhone.display}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 font-mono tabular-nums text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2"
              >
                <Phone className="w-3 h-3 shrink-0" />
                <span>{primaryPhone.display}</span>
              </a>
            </>
          )}
          {event.isRecurring && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Repeat className="w-3 h-3 shrink-0 text-slate-400" />
                <span>Recurring</span>
              </span>
            </>
          )}
          {event.status && event.status.toUpperCase() === 'CANCELLED' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-red-600 dark:text-red-400">
                Cancelled
              </span>
            </>
          )}
        </div>
      </div>

      {/* Disclosure Affordance */}
      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
    </div>
  );
};
