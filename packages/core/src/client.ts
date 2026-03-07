// ---------------------------------------------------------------------------
// @uncaughtdev/core — UncaughtClient  (SDK entry-point)
// ---------------------------------------------------------------------------

import type {
  UncaughtConfig,
  UncaughtEvent,
  Breadcrumb,
  BreadcrumbStore,
  Transport,
  SeverityLevel,
  UserInfo,
  RequestInfo,
  OperationInfo,
} from './types';

import { generateUUID, isoTimestamp } from './utils';
import { createBreadcrumbStore } from './breadcrumbs';
import { sanitize } from './sanitizer';
import { generateFingerprint } from './fingerprint';
import { createRateLimiter, type RateLimiter } from './rate-limiter';
import { detectEnvironment } from './env-detector';
import { buildFixPrompt } from './prompt-builder';
import { createTransport } from './transport';

const SDK_NAME = '@uncaughtdev/core';
const SDK_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _client: UncaughtClient | undefined;

/**
 * Initialise the Uncaught SDK.  Calling this more than once replaces the
 * previous client instance.
 */
export function initUncaught(config: UncaughtConfig): UncaughtClient {
  _client = new UncaughtClient(config);
  return _client;
}

/**
 * Return the current singleton client, or `undefined` if `initUncaught` has
 * not been called.
 */
export function getClient(): UncaughtClient | undefined {
  return _client;
}

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

export class UncaughtClient {
  private readonly config: Required<
    Pick<UncaughtConfig, 'enabled' | 'debug' | 'maxBreadcrumbs' | 'maxEventsPerMinute'>
  > &
    UncaughtConfig;

  private readonly breadcrumbs: BreadcrumbStore;
  private readonly transport: Transport;
  private readonly rateLimiter: RateLimiter;
  private readonly sessionId: string;
  private user: UserInfo | undefined;

  constructor(config: UncaughtConfig) {
    this.config = {
      enabled: true,
      debug: false,
      maxBreadcrumbs: 20,
      maxEventsPerMinute: 30,
      ...config,
    };

    this.breadcrumbs = createBreadcrumbStore(this.config.maxBreadcrumbs);
    this.transport = createTransport(this.config);
    this.rateLimiter = createRateLimiter(this.config.maxEventsPerMinute);
    this.sessionId = generateUUID();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Capture an error and send it through the transport pipeline.
   *
   * @returns The event ID, or `undefined` if the event was dropped.
   */
  captureError(
    error: unknown,
    context?: {
      request?: RequestInfo;
      operation?: OperationInfo;
      componentStack?: string;
      level?: SeverityLevel;
    }
  ): string | undefined {
    try {
      if (!this.config.enabled) return undefined;

      // --- Normalise error -------------------------------------------------
      const errorInfo = normaliseError(error);

      if (context?.componentStack) {
        errorInfo.componentStack = context.componentStack;
      }

      // --- Check ignoreErrors ----------------------------------------------
      if (this.shouldIgnore(errorInfo.message)) {
        this.debugLog('Event ignored by ignoreErrors filter');
        return undefined;
      }

      // --- Fingerprint -----------------------------------------------------
      const fingerprint = generateFingerprint(errorInfo);

      // --- Rate limit ------------------------------------------------------
      if (!this.rateLimiter.shouldAllow(fingerprint)) {
        this.debugLog(`Rate-limited: ${fingerprint}`);
        return undefined;
      }

      // --- Collect breadcrumbs ---------------------------------------------
      const crumbs = this.breadcrumbs.getAll();

      // --- Detect environment ----------------------------------------------
      const environment = detectEnvironment();

      // --- Build event -----------------------------------------------------
      const eventId = generateUUID();
      let event: UncaughtEvent = {
        eventId,
        timestamp: isoTimestamp(),
        projectKey: this.config.projectKey,
        level: context?.level ?? 'error',
        fingerprint,
        error: errorInfo,
        breadcrumbs: crumbs,
        request: context?.request,
        operation: context?.operation,
        environment,
        user: this.user
          ? { ...this.user, sessionId: this.sessionId }
          : { sessionId: this.sessionId },
        fixPrompt: '', // will be set below
        sdk: { name: SDK_NAME, version: SDK_VERSION },
      };

      // --- Sanitise --------------------------------------------------------
      event = sanitize(event, this.config.sanitizeKeys) as UncaughtEvent;

      // --- Build fix prompt ------------------------------------------------
      event.fixPrompt = buildFixPrompt(event);

      // --- beforeSend hook -------------------------------------------------
      if (this.config.beforeSend) {
        const result = this.config.beforeSend(event);
        if (result === null) {
          this.debugLog('Event dropped by beforeSend');
          return undefined;
        }
        event = result;
      }

      // --- Send ------------------------------------------------------------
      this.transport.send(event);
      this.debugLog(`Captured event: ${eventId} (${fingerprint})`);
      return eventId;
    } catch (err) {
      this.debugLog('captureError failed:', err);
      return undefined;
    }
  }

  /**
   * Capture a plain message (not backed by an Error instance).
   */
  captureMessage(
    message: string,
    level: SeverityLevel = 'info'
  ): string | undefined {
    try {
      return this.captureError(new Error(message), { level });
    } catch (err) {
      this.debugLog('captureMessage failed:', err);
      return undefined;
    }
  }

  /**
   * Add a breadcrumb to the ring buffer.
   */
  addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
    try {
      if (!this.config.enabled) return;
      this.breadcrumbs.add(crumb);
    } catch (err) {
      this.debugLog('addBreadcrumb failed:', err);
    }
  }

  /**
   * Set user context that will be attached to subsequent events.
   */
  setUser(user: UserInfo | undefined): void {
    try {
      this.user = user ? { ...user } : undefined;
    } catch (err) {
      this.debugLog('setUser failed:', err);
    }
  }

  /**
   * Flush all queued events to the transport.
   */
  async flush(): Promise<void> {
    try {
      await this.transport.flush();
    } catch (err) {
      this.debugLog('flush failed:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private shouldIgnore(message: string): boolean {
    const patterns = this.config.ignoreErrors;
    if (!patterns || patterns.length === 0) return false;

    for (const pattern of patterns) {
      if (typeof pattern === 'string') {
        if (message.includes(pattern)) return true;
      } else if (pattern instanceof RegExp) {
        if (pattern.test(message)) return true;
      }
    }

    return false;
  }

  private debugLog(...args: unknown[]): void {
    if (this.config.debug) {
      try {
        console.debug('[uncaught]', ...args);
      } catch {
        // Even console.debug can theoretically throw in exotic environments.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

interface NormalisedError {
  message: string;
  type: string;
  stack?: string;
  componentStack?: string;
  raw?: unknown;
}

function normaliseError(error: unknown): NormalisedError {
  if (error instanceof Error) {
    return {
      message: error.message || String(error),
      type: error.constructor?.name || error.name || 'Error',
      stack: error.stack,
      raw: error,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      type: 'StringError',
      stack: new Error(error).stack,
      raw: error,
    };
  }

  if (error !== null && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    return {
      message: String(obj.message ?? obj.reason ?? JSON.stringify(error)),
      type: String(obj.name ?? obj.type ?? 'ObjectError'),
      stack: typeof obj.stack === 'string' ? obj.stack : undefined,
      raw: error,
    };
  }

  return {
    message: String(error),
    type: 'UnknownError',
    raw: error,
  };
}
