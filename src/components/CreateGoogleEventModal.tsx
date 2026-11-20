import React, { useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import type { CreateGoogleEventInput } from '../services/googleCalendar';
import { toLocalDateKey } from '../utils/dateUtils';

interface CreateGoogleEventModalProps {
  isOpen: boolean;
  calendarName: string;
  isBusy: boolean;
  onSubmit: (input: CreateGoogleEventInput) => void;
  onClose: () => void;
}

export const CreateGoogleEventModal: React.FC<CreateGoogleEventModalProps> = ({
  isOpen,
  calendarName,
  isBusy,
  onSubmit,
  onClose,
}) => {
  const [summary, setSummary] = useState('');
  const [date, setDate] = useState(() => toLocalDateKey(new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setError('Enter an event title.');
      return;
    }
    if (!date) {
      setError('Select a valid date.');
      return;
    }
    setError(null);
    onSubmit({
      summary: summary.trim(),
      date,
      startTime,
      endTime,
      allDay,
      location: location.trim(),
      description: description.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-gcal-event-title"
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarPlus className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2
                id="new-gcal-event-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                New Google Calendar Event
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Target calendar: {calendarName}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}

          <div>
            <label
              htmlFor="gcal-ev-summary"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Event Title
            </label>
            <input
              id="gcal-ev-summary"
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Team planning, site visit…"
              className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="gcal-ev-date"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Date
              </label>
              <input
                id="gcal-ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2.5 min-h-[44px] sm:pt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">All-day event</span>
            </label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="gcal-ev-start"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Start Time
                </label>
                <input
                  id="gcal-ev-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="gcal-ev-end"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  End Time
                </label>
                <input
                  id="gcal-ev-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="gcal-ev-location"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Location (optional)
            </label>
            <input
              id="gcal-ev-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or meeting room"
              className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="gcal-ev-desc"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Notes (optional)
            </label>
            <textarea
              id="gcal-ev-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Event details…"
              className="w-full rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 p-3 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pb-safe">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              Review & Add Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
