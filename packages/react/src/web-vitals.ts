import type { UncaughtClient } from '@uncaughtdev/core';

/**
 * Set up Core Web Vitals tracking using native PerformanceObserver.
 * Records LCP, FID/INP, CLS, FCP, and TTFB as breadcrumbs.
 *
 * No external dependencies — uses browser-native APIs only.
 *
 * @returns Cleanup function to disconnect observers.
 */
export function setupWebVitals(client: UncaughtClient): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  const observers: PerformanceObserver[] = [];

  function recordVital(name: string, value: number, unit: string = 'ms'): void {
    try {
      const displayValue = unit === 'ms'
        ? `${Math.round(value)}ms`
        : value.toFixed(3);

      client.addBreadcrumb({
        type: 'web_vital',
        category: 'web-vital',
        message: `${name}: ${displayValue}`,
        level: 'info',
        data: { name, value, unit },
      });
    } catch {
      // Never crash
    }
  }

  // --- LCP (Largest Contentful Paint) ---
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        recordVital('LCP', last.startTime);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    observers.push(lcpObserver);
  } catch {
    // Not supported
  }

  // --- FID (First Input Delay) ---
  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const first = entries[0] as PerformanceEventTiming | undefined;
      if (first) {
        recordVital('FID', first.processingStart - first.startTime);
      }
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
    observers.push(fidObserver);
  } catch {
    // Not supported
  }

  // --- CLS (Cumulative Layout Shift) ---
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!layoutShift.hadRecentInput && layoutShift.value) {
          clsValue += layoutShift.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
    observers.push(clsObserver);

    // Report CLS on page hide
    const reportCLS = (): void => {
      if (clsValue > 0) {
        recordVital('CLS', clsValue, 'score');
      }
    };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') reportCLS();
    });
  } catch {
    // Not supported
  }

  // --- FCP (First Contentful Paint) ---
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcp = entries.find((e) => e.name === 'first-contentful-paint');
      if (fcp) {
        recordVital('FCP', fcp.startTime);
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
    observers.push(fcpObserver);
  } catch {
    // Not supported
  }

  // --- TTFB (Time to First Byte) ---
  try {
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries.length > 0) {
      const nav = navEntries[0];
      if (nav.responseStart > 0) {
        recordVital('TTFB', nav.responseStart - nav.requestStart);
      }
    }
  } catch {
    // Not supported
  }

  return () => {
    observers.forEach((o) => {
      try { o.disconnect(); } catch { /* ignore */ }
    });
  };
}

// Type augmentation for PerformanceEventTiming (not in all TS libs)
interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}
