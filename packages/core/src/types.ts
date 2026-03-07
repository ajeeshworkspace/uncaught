// ---------------------------------------------------------------------------
// @uncaughtdev/core — shared type definitions
// ---------------------------------------------------------------------------

/** How captured events are delivered. */
export type TransportMode = 'remote' | 'local' | 'console';

/** Severity levels mirroring syslog. */
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration object passed to `initUncaught()`.
 */
export interface UncaughtConfig {
  /** Project key used for authentication with the remote endpoint. */
  projectKey?: string;

  /** Remote ingestion endpoint URL. Required when transport is 'remote'. */
  endpoint?: string;

  /** Deployment environment label (e.g. "production", "staging"). */
  environment?: string;

  /** Release / version identifier. */
  release?: string;

  /** When true, the SDK logs internal debug information to the console. */
  debug?: boolean;

  /** Master kill-switch. When false the SDK is completely inert. Defaults to true. */
  enabled?: boolean;

  /** Maximum number of breadcrumbs retained in the ring buffer. Defaults to 20. */
  maxBreadcrumbs?: number;

  /** Rate-limit: max events accepted per 60-second sliding window. Defaults to 30. */
  maxEventsPerMinute?: number;

  /**
   * Lifecycle hook invoked just before an event is sent.
   * Return `null` to discard the event.
   */
  beforeSend?: (event: UncaughtEvent) => UncaughtEvent | null;

  /** Additional key patterns to redact during sanitization. */
  sanitizeKeys?: string[];

  /**
   * An array of strings or RegExp patterns.  If the error message matches any
   * of these the event is silently dropped.
   */
  ignoreErrors?: Array<string | RegExp>;

  /** Transport strategy. Defaults to 'local'. */
  transport?: TransportMode;

  /**
   * Directory used by the local-file transport.
   * Defaults to `process.cwd() + '/.uncaught'`.
   */
  localOutputDir?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Structured representation of a captured error. */
export interface ErrorInfo {
  message: string;
  type: string;
  stack?: string;
  componentStack?: string;
  raw?: unknown;
}

/** Contextual HTTP request information attached to an event. */
export interface RequestInfo {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

/** Information about a failed external operation (DB, auth, API, etc.). */
export interface OperationInfo {
  provider: string;
  type: string;
  method: string;
  params?: Record<string, unknown>;
  errorCode?: string;
  errorDetails?: string;
}

/** User context attached to events. */
export interface UserInfo {
  id?: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

/** SDK metadata shipped with every event. */
export interface SdkInfo {
  name: string;
  version: string;
}

/**
 * The canonical event payload sent to transports.
 */
export interface UncaughtEvent {
  eventId: string;
  timestamp: string;
  projectKey?: string;
  level: SeverityLevel;
  fingerprint: string;
  error: ErrorInfo;
  breadcrumbs: Breadcrumb[];
  request?: RequestInfo;
  operation?: OperationInfo;
  environment?: EnvironmentInfo;
  user?: UserInfo;
  fixPrompt: string;
  sdk: SdkInfo;
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

/** Breadcrumb categories. */
export type BreadcrumbType =
  | 'click'
  | 'navigation'
  | 'api_call'
  | 'db_query'
  | 'auth'
  | 'console'
  | 'custom';

/** A single breadcrumb entry. */
export interface Breadcrumb {
  type: BreadcrumbType;
  category: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
  level?: SeverityLevel;
}

/** Public interface of the breadcrumb ring-buffer store. */
export interface BreadcrumbStore {
  /** Append a breadcrumb (auto-timestamps). */
  add(crumb: Omit<Breadcrumb, 'timestamp'>): void;
  /** Return all stored breadcrumbs in chronological order (copies). */
  getAll(): Breadcrumb[];
  /** Return the most recent `n` breadcrumbs (copies). */
  getLast(n: number): Breadcrumb[];
  /** Empty the buffer. */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Detected runtime / platform information. */
export interface EnvironmentInfo {
  framework?: string;
  frameworkVersion?: string;
  runtime?: string;
  runtimeVersion?: string;
  platform?: string;
  os?: string;
  browser?: string;
  browserVersion?: string;
  deviceType?: string;
  locale?: string;
  timezone?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** Options used to configure a remote transport. */
export interface TransportOptions {
  endpoint: string;
  projectKey: string;
  maxRetries?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}

/** A transport implementation capable of delivering events. */
export interface Transport {
  send(event: UncaughtEvent): void;
  flush(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local issues index
// ---------------------------------------------------------------------------

export type IssueStatus = 'open' | 'resolved' | 'ignored';

export interface IssueEntry {
  fingerprint: string;
  title: string;
  errorType: string;
  count: number;
  affectedUsers: string[];
  firstSeen: string;
  lastSeen: string;
  status: IssueStatus;
  fixPromptFile: string;
  latestEventFile: string;
}
