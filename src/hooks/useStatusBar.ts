import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Manages status bar appearance and safe area insets on mobile and tablet:
 * - Keeps the app full-screen (edge-to-edge behind the status bar)
 * - Sets the status bar icon style (dark icons in light mode, light icons in dark mode)
 *   so the clock, battery, and signal indicators are clearly visible against the header
 * - Updates the browser/PWA <meta name="theme-color"> dynamically
 * - Detects native status bar height to feed --safe-area-top-dynamic
 */
export function useStatusBar(isDark: boolean) {
  useEffect(() => {
    // 1. Web & PWA: update <meta name="theme-color"> to match header background
    const lightHeaderBg = '#ffffff';
    const darkHeaderBg = '#0f172a';
    const targetColor = isDark ? darkHeaderBg : lightHeaderBg;

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', targetColor);

    // Apple mobile status bar style
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleMeta) {
      appleMeta.setAttribute('content', isDark ? 'black-translucent' : 'default');
    }

    // 2. Capacitor Android & iOS native status bar synchronization
    if (Capacitor.isPluginAvailable('StatusBar')) {
      let cancelled = false;

      const refreshStatusBarHeight = async () => {
        try {
          const info = await StatusBar.getInfo();
          if (!cancelled && info && typeof info.height === 'number' && info.height > 0) {
            const clampedHeight = Math.min(96, Math.max(0, Math.round(info.height)));
            document.documentElement.style.setProperty(
              '--safe-area-top-dynamic',
              `${clampedHeight}px`
            );
          }
        } catch {
          // Ignore if unavailable
        }
      };

      const applyNativeStatusBar = async () => {
        try {
          // Keep the app full-screen (edge-to-edge)
          await StatusBar.setOverlaysWebView({ overlay: true });
          // Style.Light = Dark icons for light backgrounds (white header)
          // Style.Dark  = Light icons for dark backgrounds (slate-900 header)
          await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
          await StatusBar.show();
          await refreshStatusBarHeight();
        } catch {
          // Gracefully fallback on web preview or unsupported environments
        }
      };

      void applyNativeStatusBar();
      const timerId = window.setTimeout(() => {
        void refreshStatusBarHeight();
      }, 150);

      const handleViewportChange = () => {
        void refreshStatusBarHeight();
      };
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('orientationchange', handleViewportChange);

      return () => {
        cancelled = true;
        window.clearTimeout(timerId);
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('orientationchange', handleViewportChange);
      };
    }
  }, [isDark]);
}
