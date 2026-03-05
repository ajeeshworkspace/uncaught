// ---------------------------------------------------------------------------
// @uncaught/core — runtime / platform environment detector
// ---------------------------------------------------------------------------

import type { EnvironmentInfo } from './types';

/** Cached result so detection only runs once per process / page-load. */
let cached: EnvironmentInfo | undefined;

/**
 * Detect the current runtime environment.
 *
 * - SSR-safe: every global access is guarded.
 * - Result is cached after the first invocation.
 */
export function detectEnvironment(): EnvironmentInfo {
  if (cached) return cached;

  const info: EnvironmentInfo = {};

  try {
    const isBrowser =
      typeof window !== 'undefined' && typeof document !== 'undefined';
    const isNode =
      typeof process !== 'undefined' &&
      process.versions != null &&
      process.versions.node != null;

    // ----- Runtime ---------------------------------------------------------
    if (isNode) {
      info.runtime = 'node';
      info.runtimeVersion = process.versions.node;
      info.platform = process.platform;
      info.os = detectNodeOS();
    } else if (isBrowser) {
      info.runtime = 'browser';
      info.platform = 'web';

      const ua = navigator?.userAgent ?? '';
      const browserInfo = parseBrowserUA(ua);
      info.browser = browserInfo.name;
      info.browserVersion = browserInfo.version;
      info.os = parseOS(ua);
      info.deviceType = detectDeviceType();
      info.url = location?.href;
      info.locale = navigator?.language;
      info.timezone = Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone;
    }

    // ----- Framework detection (works in both Node & browser) ---------------
    detectFramework(info);
  } catch {
    // Silent — environment detection must never throw.
  }

  cached = info;
  return info;
}

/**
 * Reset the cached environment (useful for testing).
 */
export function resetEnvironmentCache(): void {
  cached = undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectNodeOS(): string | undefined {
  try {
    const platform = process.platform;
    const map: Record<string, string> = {
      darwin: 'macOS',
      win32: 'Windows',
      linux: 'Linux',
      freebsd: 'FreeBSD',
      sunos: 'SunOS',
    };
    return map[platform] ?? platform;
  } catch {
    return undefined;
  }
}

interface BrowserInfo {
  name?: string;
  version?: string;
}

function parseBrowserUA(ua: string): BrowserInfo {
  // Order matters — check more specific browsers first.
  const patterns: Array<{ name: string; regex: RegExp }> = [
    { name: 'Edge', regex: /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/ },
    { name: 'Opera', regex: /(?:OPR|Opera)\/(\d+[\d.]*)/ },
    { name: 'Samsung Internet', regex: /SamsungBrowser\/(\d+[\d.]*)/ },
    { name: 'UC Browser', regex: /UCBrowser\/(\d+[\d.]*)/ },
    { name: 'Firefox', regex: /Firefox\/(\d+[\d.]*)/ },
    { name: 'Chrome', regex: /Chrome\/(\d+[\d.]*)/ },
    { name: 'Safari', regex: /Version\/(\d+[\d.]*).*Safari/ },
  ];

  for (const { name, regex } of patterns) {
    const match = ua.match(regex);
    if (match) {
      return { name, version: match[1] };
    }
  }

  return {};
}

function parseOS(ua: string): string | undefined {
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|macOS/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  return undefined;
}

function detectDeviceType(): string | undefined {
  try {
    if (typeof window === 'undefined') return undefined;

    const width = window.screen?.width ?? window.innerWidth;

    if (width <= 480) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  } catch {
    return undefined;
  }
}

function detectFramework(info: EnvironmentInfo): void {
  try {
    // ----- Browser-side markers -------------------------------------------
    if (typeof window !== 'undefined') {
      // Next.js injects __NEXT_DATA__
      if ((window as any).__NEXT_DATA__) {
        info.framework = 'next';
        info.frameworkVersion =
          (window as any).__NEXT_DATA__?.buildId ?? undefined;
      }
      // Remix injects __remixContext
      else if ((window as any).__remixContext) {
        info.framework = 'remix';
      }
      // Nuxt injects __NUXT__
      else if ((window as any).__NUXT__) {
        info.framework = 'nuxt';
      }
    }

    // ----- Node-side markers -----------------------------------------------
    if (
      typeof process !== 'undefined' &&
      process.env != null
    ) {
      // Framework env vars set during SSR / server build
      if (!info.framework) {
        if (process.env.__NEXT_PRIVATE_ORIGIN !== undefined || process.env.NEXT_RUNTIME) {
          info.framework = 'next';
        } else if (process.env.REMIX_DEV_ORIGIN !== undefined) {
          info.framework = 'remix';
        }
      }

      // Hosting platform markers
      if (process.env.VERCEL) {
        info.platform = info.platform ?? 'vercel';
      } else if (process.env.RAILWAY_PROJECT_ID) {
        info.platform = info.platform ?? 'railway';
      } else if (process.env.FLY_APP_NAME) {
        info.platform = info.platform ?? 'fly';
      } else if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        info.platform = info.platform ?? 'aws-lambda';
      } else if (process.env.GOOGLE_CLOUD_PROJECT) {
        info.platform = info.platform ?? 'gcp';
      }
    }

    // ----- Vite (import.meta.env) ------------------------------------------
    try {
      if (typeof (import.meta as any)?.env?.VITE_USER_NODE_ENV !== 'undefined') {
        if (!info.framework) {
          info.framework = 'vite';
        }
      }
    } catch {
      // import.meta may not exist in CJS contexts
    }
  } catch {
    // Silent — never throw during detection.
  }
}
