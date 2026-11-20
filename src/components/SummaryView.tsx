import React, { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Calendar, Clock, Search, Tag, X } from 'lucide-react';
import type { CalendarEvent, ScheduleFilter } from '../types/calendar';
import { eventStartsOrContinuesFromToday, eventTouchesRange } from '../utils/dateUtils';
import {
  computeScheduleSummary,
  formatTotalDuration,
  getEventCategories,
  type SummarySortBy,
} from '../utils/summaryUtils';

interface SummaryViewProps {
  events: CalendarEvent[];
  nowMs: number;
  scope: ScheduleFilter;
  onChangeScope: (scope: ScheduleFilter) => void;
  onSelectCategory: (category: string) => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  events,
  nowMs,
  scope,
  onChangeScope,
  onSelectCategory,
}) => {
  const [sortBy, setSortBy] = useState<SummarySortBy>('duration');
  const [searchQuery, setSearchQuery] = useState('');

  const scopedEvents = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const q = searchQuery.trim().toLowerCase();

    return events.filter((ev) => {
      if (scope === 'upcoming' && !eventStartsOrContinuesFromToday(ev, startOfToday)) {
        return false;
      }
      if (scope === 'today' && !eventTouchesRange(ev, startOfToday, endOfToday)) {
        return false;
      }
      if (!q) return true;

      const haystack = [
        ev.summary,
        ev.location,
        ev.description,
        ev.organizer,
        ev.calendarTitle,
        ...getEventCategories(ev),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [events, scope, nowMs, searchQuery]);

  const summary = useMemo(
    () => computeScheduleSummary(scopedEvents, sortBy),
    [scopedEvents, sortBy]
  );

  const maxCategoryDurationMs = useMemo(
    () =>
      summary.categories.reduce(
        (max, item) => Math.max(max, item.totalDurationMs),
        0
      ),
    [summary.categories]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Schedule Summary
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Event totals and cumulative duration grouped by category or tag
        </p>
      </div>

      {/* Search & Scope Bar (pinned on top while scrolling Summary) */}
      <div className="sticky top-safe lg:top-14 z-20 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 py-2 bg-[#F7F8FA]/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/70 lg:border-b-0 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories, events, or locations…"
            aria-label="Search summary categories and events"
            className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 pl-10 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl shrink-0">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'all', label: 'All Events' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeScope(item.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                scope === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Totals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Events</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {summary.totalEvents}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {summary.timedEvents} timed · {summary.allDayEvents} all-day
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Duration</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatTotalDuration(summary.totalDurationMs)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {formatTotalDuration(summary.timedDurationMs)} timed
            {summary.timedEvents > 0
              ? ` · avg ${formatTotalDuration(summary.averageTimedDurationMs)}`
              : ''}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Categories & Tags</span>
            <Tag className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {summary.categoryCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tap any category below to view events
          </p>
        </div>
      </div>

      {/* Category Breakdown List */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Breakdown by Category / Tag
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl self-start sm:self-auto">
            {(
              [
                { id: 'duration', label: 'Duration' },
                { id: 'count', label: 'Events' },
                { id: 'name', label: 'Name' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSortBy(option.id)}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  sortBy === option.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {summary.categories.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {searchQuery.trim()
                ? 'No matching categories or events'
                : 'No events in this time range'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchQuery.trim()
                ? 'Try clearing your search or switching to All Events.'
                : 'Switch to All Events or sync your schedule to populate category totals.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {summary.categories.map((item) => {
              const barWidthPercent =
                maxCategoryDurationMs > 0
                  ? Math.max(4, Math.round((item.totalDurationMs / maxCategoryDurationMs) * 100))
                  : 0;

              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => onSelectCategory(item.category)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.category}
                        </p>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {item.eventCount} {item.eventCount === 1 ? 'event' : 'events'}
                        {item.allDayCount > 0 ? ` (${item.allDayCount} all-day)` : ''} ·{' '}
                        {item.sharePercent}% of total · avg{' '}
                        {formatTotalDuration(item.averageDurationMs)}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatTotalDuration(item.totalDurationMs)}
                      </p>
                      {item.allDayCount > 0 && item.timedDurationMs > 0 && (
                        <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatTotalDuration(item.timedDurationMs)} timed
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-700 dark:bg-blue-500 transition-all"
                      style={{ width: `${barWidthPercent}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
