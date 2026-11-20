import type { CalendarEvent } from '../types/calendar';

export interface CategorySummaryItem {
  category: string;
  eventCount: number;
  timedCount: number;
  allDayCount: number;
  totalDurationMs: number;
  timedDurationMs: number;
  averageDurationMs: number;
  sharePercent: number;
}

export interface ScheduleSummary {
  totalEvents: number;
  timedEvents: number;
  allDayEvents: number;
  totalDurationMs: number;
  timedDurationMs: number;
  averageTimedDurationMs: number;
  categoryCount: number;
  categories: CategorySummaryItem[];
}

export type SummarySortBy = 'duration' | 'count' | 'name';

export function getEventDurationMs(event: CalendarEvent): number {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

export function formatTotalDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function getEventCategories(event: CalendarEvent): string[] {
  const cleaned = (event.categories ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  if (cleaned.length > 0) {
    return Array.from(new Set(cleaned));
  }
  if (event.source === 'google' && event.calendarTitle) {
    return [event.calendarTitle];
  }
  return ['Uncategorized'];
}

export function computeScheduleSummary(
  events: CalendarEvent[],
  sortBy: SummarySortBy = 'duration'
): ScheduleSummary {
  let totalDurationMs = 0;
  let timedDurationMs = 0;
  let timedEvents = 0;
  let allDayEvents = 0;

  const bucketMap = new Map<
    string,
    {
      eventCount: number;
      timedCount: number;
      allDayCount: number;
      totalDurationMs: number;
      timedDurationMs: number;
    }
  >();

  for (const ev of events) {
    const durMs = getEventDurationMs(ev);
    totalDurationMs += durMs;
    if (ev.allDay) {
      allDayEvents += 1;
    } else {
      timedEvents += 1;
      timedDurationMs += durMs;
    }

    const cats = getEventCategories(ev);
    for (const cat of cats) {
      const existing = bucketMap.get(cat) ?? {
        eventCount: 0,
        timedCount: 0,
        allDayCount: 0,
        totalDurationMs: 0,
        timedDurationMs: 0,
      };

      existing.eventCount += 1;
      existing.totalDurationMs += durMs;
      if (ev.allDay) {
        existing.allDayCount += 1;
      } else {
        existing.timedCount += 1;
        existing.timedDurationMs += durMs;
      }

      bucketMap.set(cat, existing);
    }
  }

  const denominatorMs = Array.from(bucketMap.values()).reduce(
    (acc, item) => acc + item.totalDurationMs,
    0
  );

  const categories: CategorySummaryItem[] = Array.from(bucketMap.entries()).map(
    ([category, stats]) => ({
      category,
      eventCount: stats.eventCount,
      timedCount: stats.timedCount,
      allDayCount: stats.allDayCount,
      totalDurationMs: stats.totalDurationMs,
      timedDurationMs: stats.timedDurationMs,
      averageDurationMs:
        stats.eventCount > 0 ? Math.round(stats.totalDurationMs / stats.eventCount) : 0,
      sharePercent:
        denominatorMs > 0
          ? Math.round((stats.totalDurationMs / denominatorMs) * 100)
          : events.length > 0
          ? Math.round((stats.eventCount / events.length) * 100)
          : 0,
    })
  );

  categories.sort((a, b) => {
    if (sortBy === 'count') {
      return b.eventCount - a.eventCount || b.totalDurationMs - a.totalDurationMs;
    }
    if (sortBy === 'name') {
      return a.category.localeCompare(b.category);
    }
    return b.totalDurationMs - a.totalDurationMs || b.eventCount - a.eventCount;
  });

  return {
    totalEvents: events.length,
    timedEvents,
    allDayEvents,
    totalDurationMs,
    timedDurationMs,
    averageTimedDurationMs: timedEvents > 0 ? Math.round(timedDurationMs / timedEvents) : 0,
    categoryCount: categories.length,
    categories,
  };
}
