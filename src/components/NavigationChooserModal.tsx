import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  ExternalLink,
  MapPin,
  Navigation,
  Route,
  Smartphone,
  X,
} from 'lucide-react';
import { NAV_APP_OPTIONS, type NavAppId } from '../utils/navigationPrefs';

interface NavigationChooserModalProps {
  location: string | null;
  defaultNavApp: NavAppId | null;
  onSaveDefaultNavApp: (appId: NavAppId | null) => void;
  onClose: () => void;
}

const OPTION_STYLES: Record<
  NavAppId,
  { accentClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  'google-maps': {
    accentClass: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400',
    Icon: Navigation,
  },
  waze: {
    accentClass: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400',
    Icon: Compass,
  },
  'apple-maps': {
    accentClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400',
    Icon: MapPin,
  },
  'tomtom-android': {
    accentClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400',
    Icon: Route,
  },
  'device-default': {
    accentClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    Icon: Smartphone,
  },
};

export const NavigationChooserModal: React.FC<NavigationChooserModalProps> = ({
  location,
  defaultNavApp,
  onSaveDefaultNavApp,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(Boolean(defaultNavApp));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const defaultNavAppRef = useRef(defaultNavApp);
  defaultNavAppRef.current = defaultNavApp;

  useEffect(() => {
    setCopied(false);
    setSaveAsDefault(Boolean(defaultNavAppRef.current));
  }, [location]);

  useEffect(() => {
    if (!location) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [location]);

  if (!location) return null;

  const trimmed = location.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleOptionSelect = (appId: NavAppId) => {
    if (saveAsDefault) {
      onSaveDefaultNavApp(appId);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-chooser-title"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="px-5 pt-4 pb-3.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="nav-chooser-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Choose navigation app
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words">
              {trimmed}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation chooser"
            className="min-h-[40px] min-w-[40px] -mr-1.5 -mt-1 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {NAV_APP_OPTIONS.map((option) => {
            const { accentClass, Icon } = OPTION_STYLES[option.id];
            const isDefault = defaultNavApp === option.id;
            return (
              <a
                key={option.id}
                href={option.getUrl(trimmed)}
                target={option.externalTab ? '_blank' : undefined}
                rel={option.externalTab ? 'noopener noreferrer' : undefined}
                onClick={() => handleOptionSelect(option.id)}
                className="w-full min-h-[56px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accentClass}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {option.name}
                      {isDefault && (
                        <span className="ml-2 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                          · Default
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {option.subtitle}
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
              </a>
            );
          })}

          <label className="mt-2 pt-1 flex items-center gap-2.5 min-h-[40px] px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Save selected app as default (can be changed in Account)
            </span>
          </label>
        </div>

        <div className="px-4 pb-4 pt-1 flex items-center gap-2 pb-safe">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Address copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy address</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
