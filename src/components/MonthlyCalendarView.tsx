import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '../types/calendar';
import {
  formatDayHeading,
  formatTimeShort,
  getEventEffectiveRange,
  toLocalDateKey,
} from '../utils/dateUtils';
import { EventRow } from './EventRow';

interface MonthlyCalendarViewProps {
  events: CalendarEvent[];
  nowMs: number;
  selectedDateKey: string;
  onSelectDateKey: (dateKey: string) => void;
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onRequestNavigate: (location: string) => void;
  isSearchOrCategoryActive?: boolean;
  onClearFilters?: () => void;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  return {
    year: y || new Date().getFullYear(),
    month: (m || 1) - 1,
    day: d || 1,
  };
}

function buildMonthGrid(year: number, month: number): Array<{
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  startMs: number;
  endMs: number;
}> {
  const firstOfMonth = new Date(year, month, 1);
  // Convert JS Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells: Array<{
    dateKey: string;
    dayNumber: number;
    inCurrentMonth: boolean;
    startMs: number;
    endMs: number;
  }> = [];

  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(year, month, 1 - startOffset + i);
    const nextDate = new Date(year, month, 1 - startOffset + i + 1);
    cells.push({
      dateKey: toLocalDateKey(cellDate),
      dayNumber: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === month && cellDate.getFullYear() === year,
      startMs: cellDate.getTime(),
      endMs: nextDate.getTime(),
    });
  }

  return cells;
}

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  events,
  nowMs,
  selectedDateKey,
  onSelectDateKey,
  selectedEventId,
  onSelectEvent,
  onRequestNavigate,
  isSearchOrCategoryActive = false,
  onClearFilters,
}) => {
  const todayKey = toLocalDateKey(new Date(nowMs));

  const [displayMonth, setDisplayMonth] = useState<{ year: number; month: number }>(() => {
    const parsed = parseDateKey(selectedDateKey);
    return { year: parsed.year, month: parsed.month };
  });

  // Sync displayed month whenever selectedDateKey moves to a different month externally
  useEffect(() => {
    const parsed = parseDateKey(selectedDateKey);
    setDisplayMonth((prev) =>
      prev.year === parsed.year && prev.month === parsed.month
        ? prev
        : { year: parsed.year, month: parsed.month }
    );
  }, [selectedDateKey]);

  const monthCells = useMemo(
    () => buildMonthGrid(displayMonth.year, displayMonth.month),
    [displayMonth.year, displayMonth.month]
  );

  // Map each visible day cell in the grid to its sorted events (including multi-day spans)
  const eventsByCellKey = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (monthCells.length === 0) return map;

    const gridStartMs = monthCells[0].startMs;
    const gridEndMs = monthCells[monthCells.length - 1].endMs;

    for (const cell of monthCells) {
      map.set(cell.dateKey, []);
    }

    for (const ev of events) {
      const { startMs, endMs } = getEventEffectiveRange(ev);
      if (endMs <= gridStartMs && startMs < gridStartMs) continue;
      if (startMs >= gridEndMs) continue;

      for (const cell of monthCells) {
        if (startMs < cell.endMs && (endMs > cell.startMs || startMs >= cell.startMs)) {
          map.get(cell.dateKey)?.push(ev);
        }
      }
    }

    for (const [, list] of map) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return getEventEffectiveRange(a).startMs - getEventEffectiveRange(b).startMs;
      });
    }

    return map;
  }, [events, monthCells]);

  // Events for selectedDateKey even if selectedDateKey temporarily falls outside grid
  const selectedDayEvents = useMemo(() => {
    const fromGrid = eventsByCellKey.get(selectedDateKey);
    if (fromGrid) return fromGrid;

    const { year, month, day } = parseDateKey(selectedDateKey);
    const dayStartMs = new Date(year, month, day).getTime();
    const dayEndMs = new Date(year, month, day + 1).getTime();

    return events
      .filter((ev) => {
        const { startMs, endMs } = getEventEffectiveRange(ev);
        return startMs < dayEndMs && (endMs > dayStartMs || startMs >= dayStartMs);
      })
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return getEventEffectiveRange(a).startMs - getEventEffectiveRange(b).startMs;
      });
  }, [eventsByCellKey, events, selectedDateKey]);

  const monthEventCount = useMemo(() => {
    const uniqueIds = new Set<string>();
    for (const cell of monthCells) {
      if (!cell.inCurrentMonth) continue;
      for (const ev of eventsByCellKey.get(cell.dateKey) ?? []) {
        uniqueIds.add(ev.id);
      }
    }
    return uniqueIds.size;
  }, [monthCells, eventsByCellKey]);

  const firstEventDateKey = useMemo(() => {
    if (events.length === 0) return null;
    const sorted = [...events].sort(
      (a, b) => getEventEffectiveRange(a).startMs - getEventEffectiveRange(b).startMs
    );
    const upcomingOrToday = sorted.find(
      (ev) => getEventEffectiveRange(ev).startDateKey >= todayKey
    );
    return getEventEffectiveRange(upcomingOrToday ?? sorted[0]).startDateKey;
  }, [events, todayKey]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(displayMonth.year, displayMonth.month, 1)),
    [displayMonth.year, displayMonth.month]
  );

  const goToRelativeMonth = (delta: number) => {
    const target = new Date(displayMonth.year, displayMonth.month + delta, 1);
    const nextYear = target.getFullYear();
    const nextMonth = target.getMonth();
    setDisplayMonth({ year: nextYear, month: nextMonth });

    const todayParsed = parseDateKey(todayKey);
    if (todayParsed.year === nextYear && todayParsed.month === nextMonth) {
      onSelectDateKey(todayKey);
    } else {
      onSelectDateKey(toLocalDateKey(target));
    }
  };

  const goToToday = () => {
    const todayParsed = parseDateKey(todayKey);
    setDisplayMonth({ year: todayParsed.year, month: todayParsed.month });
    onSelectDateKey(todayKey);
  };

  const isViewingCurrentMonthAndToday =
    selectedDateKey === todayKey &&
    displayMonth.year === parseDateKey(todayKey).year &&
    displayMonth.month === parseDateKey(todayKey).month;

  const selectedHeading = formatDayHeading(selectedDateKey, new Date(nowMs));
  const isSelectedToday = selectedDateKey === todayKey;

  return (
    <div className="space-y-5">
      {/* Month Calendar Card */}
      <section
        aria-label="Monthly calendar"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden"
      >
        {/* Month Navigation Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {monthLabel}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {monthEventCount} {monthEventCount === 1 ? 'event' : 'events'} this month
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isViewingCurrentMonthAndToday && (
              <button
                type="button"
                onClick={goToToday}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => goToRelativeMonth(-1)}
              aria-label="Previous month"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => goToRelativeMonth(1)}
              aria-label="Next month"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Weekday Header Row */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          {WEEKDAY_LABELS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* 7-Column Month Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800/80 border-b border-slate-100 dark:border-slate-800/80 -mb-px -mr-px">
          {monthCells.map((cell) => {
            const cellEvents = eventsByCellKey.get(cell.dateKey) ?? [];
            const isSelected = cell.dateKey === selectedDateKey;
            const isToday = cell.dateKey === todayKey;

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => onSelectDateKey(cell.dateKey)}
                aria-label={`${cell.dateKey}, ${cellEvents.length} ${
                  cellEvents.length === 1 ? 'event' : 'events'
                }`}
                aria-pressed={isSelected}
                className={`min-h-[54px] sm:min-h-[86px] p-1 sm:p-1.5 flex flex-col items-center sm:items-stretch justify-start gap-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600 ${
                  isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/45'
                    : cell.inCurrentMonth
                    ? 'bg-white dark:bg-slate-900 hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                    : 'bg-slate-50/60 dark:bg-slate-950/35 hover:bg-slate-100/70 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`mx-auto sm:mx-0 w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-mono tabular-nums font-semibold transition-colors ${
                      isToday && isSelected
                        ? 'bg-blue-700 text-white'
                        : isToday
                        ? 'ring-1.5 ring-blue-600 dark:ring-blue-400 text-blue-700 dark:text-blue-400'
                        : isSelected
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : cell.inCurrentMonth
                        ? 'text-slate-800 dark:text-slate-200'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {cellEvents.length > 0 && (
                    <span className="hidden sm:inline text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500 pr-0.5">
                      {cellEvents.length}
                    </span>
                  )}
                </div>

                {/* Mobile compact indicator dots */}
                {cellEvents.length > 0 && (
                  <div className="flex sm:hidden items-center justify-center gap-0.5 min-h-[6px]">
                    {cellEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        aria-hidden="true"
                        className={`w-1.5 h-1.5 rounded-full ${
                          ev.source === 'google'
                            ? 'bg-emerald-600 dark:bg-emerald-400'
                            : 'bg-blue-600 dark:bg-blue-400'
                        }`}
                      />
                    ))}
                    {cellEvents.length > 3 && (
                      <span className="text-[9px] leading-none font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        +
                      </span>
                    )}
                  </div>
                )}

                {/* Desktop/tablet compact single-line previews */}
                {cellEvents.length > 0 && (
                  <div className="hidden sm:flex flex-col gap-0.5 w-full min-w-0">
                    {cellEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`px-1.5 py-0.5 rounded text-[10px] leading-tight truncate font-medium ${
                          ev.source === 'google'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200'
                            : 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200'
                        }`}
                      >
                        {!ev.allDay ? `${formatTimeShort(ev.start)} ` : ''}
                        {ev.summary}
                      </div>
                    ))}
                    {cellEvents.length > 2 && (
                      <span className="px-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        +{cellEvents.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Day Schedule Panel */}
      <section aria-labelledby="selected-month-day-heading">
        <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
          <h3
            id="selected-month-day-heading"
            className={`text-sm font-bold tracking-tight ${
              isSelectedToday
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {selectedHeading.primary}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {' '}
              · {selectedHeading.secondary}
            </span>
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
            {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {selectedDayEvents.length > 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
            {selectedDayEvents.map((ev) => (
              <EventRow
                key={ev.id}
                event={ev}
                nowMs={nowMs}
                isSelected={selectedEventId === ev.id}
                onSelect={onSelectEvent}
                onRequestNavigate={onRequestNavigate}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 text-center space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isSearchOrCategoryActive
                ? 'No matching events on this day'
                : 'No events scheduled for this day'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {firstEventDateKey && firstEventDateKey !== selectedDateKey && (
                <button
                  type="button"
                  onClick={() => onSelectDateKey(firstEventDateKey)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap"
                >
                  Jump to next event
                </button>
              )}
              {isSearchOrCategoryActive && onClearFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
