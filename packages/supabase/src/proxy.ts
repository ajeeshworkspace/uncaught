// ---------------------------------------------------------------------------
// @uncaught/supabase — deep Proxy wrapper
// ---------------------------------------------------------------------------
//
// Creates a transparent Proxy around a SupabaseClient that intercepts all
// operations to capture errors and record breadcrumbs, without changing any
// observable behavior. The wrapped client has identical types and behavior
// to the original — the Proxy is fully transparent.
//
// Strategy:
// 1. Wrap the top-level SupabaseClient with a Proxy.
// 2. When .from(), .auth, .functions, .storage is accessed, return a proxied
//    version that tracks operations via QueryTracker.
// 3. QueryTracker records each method in the chain (.select(), .eq(), etc.).
// 4. When a terminal operation executes (returns a Promise/thenable), we
//    intercept the resolved value.
// 5. If the result has an `error` field (Supabase's { data, error } pattern),
//    we capture it with full context via getClient().captureError().
// 6. We ALWAYS return the original result — completely transparent.
// ---------------------------------------------------------------------------

import { getClient, sanitize } from '@uncaught/core';
import type { Breadcrumb, OperationInfo } from '@uncaught/core';
import { QueryTracker } from './query-tracker';
import { parseSupabaseError, type ErrorParserContext } from './error-parser';
import type { WrapSupabaseOptions } from './types';

// ---------------------------------------------------------------------------
// Sensitive key patterns that must never be captured
// ---------------------------------------------------------------------------

const AUTH_SENSITIVE_KEYS = new Set([
  'password',
  'access_token',
  'refresh_token',
  'token',
  'session',
  'cookie',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'credential',
  'credentials',
  'nonce',
  'code_verifier',
  'code_challenge',
]);

/**
 * Deep-sanitize an object, redacting any keys that match sensitive patterns.
 * This is used specifically for auth-related data where we want to be extra
 * cautious about not capturing passwords, tokens, or session data.
 */
function sanitizeAuthData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeAuthData);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (AUTH_SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeAuthData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Safely extract a string representation from an argument for breadcrumbs.
 */
function safeArgString(arg: unknown): string {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    const str = JSON.stringify(arg);
    return str.length > 100 ? str.slice(0, 97) + '...' : str;
  } catch {
    return '[object]';
  }
}

/**
 * Add a breadcrumb to the Uncaught client. Silently no-ops if the client
 * is not initialized.
 */
function addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
  try {
    const client = getClient();
    if (client) {
      client.addBreadcrumb(crumb);
    }
  } catch {
    // Client not initialized — silently ignore
  }
}

/**
 * Capture an error through the Uncaught client. Silently no-ops if the
 * client is not initialized.
 */
function captureError(
  error: unknown,
  context: {
    operation?: OperationInfo;
    extra?: Record<string, unknown>;
  },
): void {
  try {
    const client = getClient();
    if (client) {
      client.captureError(error, context);
    }
  } catch {
    // Client not initialized — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Result inspection
// ---------------------------------------------------------------------------

/**
 * Check if a value looks like Supabase's { data, error } response pattern.
 */
function isSupabaseResult(value: unknown): value is { data: unknown; error: unknown } {
  if (value === null || typeof value !== 'object') return false;
  return 'data' in value && 'error' in value;
}

/**
 * Check if a value is a thenable (Promise-like).
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).then === 'function'
  );
}

// ---------------------------------------------------------------------------
// Query builder proxy (for .from() chains)
// ---------------------------------------------------------------------------

/**
 * Create a proxy around a Supabase query builder that tracks each method
 * call and intercepts the terminal operation to check for errors.
 */
function createQueryBuilderProxy(
  target: unknown,
  tracker: QueryTracker,
  options: WrapSupabaseOptions,
): unknown {
  if (target === null || target === undefined) return target;
  if (typeof target !== 'object' && typeof target !== 'function') return target;

  return new Proxy(target as object, {
    get(obj: object, prop: string | symbol, receiver: unknown): unknown {
      // Pass through symbols and non-string props transparently
      if (typeof prop === 'symbol') {
        try {
          return Reflect.get(obj, prop, receiver);
        } catch {
          return undefined;
        }
      }

      // Special: handle `then` to intercept Promise resolution
      if (prop === 'then') {
        const thenFn = Reflect.get(obj, prop, receiver);
        if (typeof thenFn !== 'function') return thenFn;

        // This is a terminal operation — the chain is being awaited
        return function proxiedThen(
          onFulfilled?: ((value: unknown) => unknown) | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ): unknown {
          return thenFn.call(
            obj,
            (result: unknown) => {
              handleQueryResult(result, tracker, options);
              return onFulfilled ? onFulfilled(result) : result;
            },
            (reason: unknown) => {
              handleQueryError(reason, tracker, options);
              return onRejected ? onRejected(reason) : Promise.reject(reason);
            },
          );
        };
      }

      // Handle `catch` for Promise rejection
      if (prop === 'catch') {
        const catchFn = Reflect.get(obj, prop, receiver);
        if (typeof catchFn !== 'function') return catchFn;

        return function proxiedCatch(
          onRejected?: ((reason: unknown) => unknown) | null,
        ): unknown {
          return catchFn.call(obj, (reason: unknown) => {
            handleQueryError(reason, tracker, options);
            return onRejected ? onRejected(reason) : Promise.reject(reason);
          });
        };
      }

      // Handle `finally` passthrough
      if (prop === 'finally') {
        const finallyFn = Reflect.get(obj, prop, receiver);
        if (typeof finallyFn !== 'function') return finallyFn;

        return function proxiedFinally(onFinally?: (() => void) | null): unknown {
          return finallyFn.call(obj, onFinally);
        };
      }

      let value: unknown;
      try {
        value = Reflect.get(obj, prop, receiver);
      } catch {
        return undefined;
      }

      // If the property is a function, wrap it to track the call
      if (typeof value === 'function') {
        return function (this: unknown, ...args: unknown[]): unknown {
          // Track the method call
          tracker.track(prop, args);

          let result: unknown;
          try {
            result = value.apply(obj, args);
          } catch (err) {
            // Synchronous error during method call
            handleQueryError(err, tracker, options);
            throw err;
          }

          // If the result is thenable, wrap it for error interception
          if (isThenable(result)) {
            return createQueryBuilderProxy(result, tracker, options);
          }

          // If the result is an object (next builder in chain), proxy it too
          if (result !== null && typeof result === 'object') {
            return createQueryBuilderProxy(result, tracker, options);
          }

          return result;
        };
      }

      // If the value is an object, recursively proxy for continued chaining
      if (value !== null && typeof value === 'object') {
        return createQueryBuilderProxy(value, tracker, options);
      }

      return value;
    },
  });
}

/**
 * Handle the resolved result of a query chain, checking for Supabase errors.
 */
function handleQueryResult(
  result: unknown,
  tracker: QueryTracker,
  _options: WrapSupabaseOptions,
): void {
  try {
    const trackedQuery = tracker.toTrackedQuery();
    const breadcrumbData: Record<string, unknown> = {
      table: trackedQuery.table,
      operation: trackedQuery.operation,
      chain: trackedQuery.humanReadable,
    };

    if (isSupabaseResult(result) && result.error) {
      // Error in the { data, error } response
      const parserContext: ErrorParserContext = {
        table: trackedQuery.table,
        operation: trackedQuery.operation,
        queryChain: trackedQuery.humanReadable,
      };

      const parsed = parseSupabaseError(result.error, parserContext);

      addBreadcrumb({
        type: 'db_query',
        category: 'supabase.query',
        message: `Failed: ${trackedQuery.humanReadable}`,
        data: {
          ...breadcrumbData,
          errorCode: parsed.errorCode,
          errorType: parsed.errorType,
        },
        level: 'error',
      });

      const operationInfo = tracker.toOperationInfo();
      operationInfo.errorCode = parsed.errorCode;
      operationInfo.errorDetails = parsed.humanExplanation;

      captureError(result.error, {
        operation: operationInfo,
        extra: {
          supabase: {
            query: trackedQuery.humanReadable,
            table: trackedQuery.table,
            operation: trackedQuery.operation,
            parsedError: parsed,
          },
        },
      });
    } else {
      // Successful query — add success breadcrumb
      addBreadcrumb({
        type: 'db_query',
        category: 'supabase.query',
        message: `OK: ${trackedQuery.humanReadable}`,
        data: breadcrumbData,
        level: 'info',
      });
    }
  } catch {
    // Never crash the host app — silently swallow tracking errors
  }
}

/**
 * Handle a rejected Promise or synchronous throw from a query chain.
 */
function handleQueryError(
  reason: unknown,
  tracker: QueryTracker,
  _options: WrapSupabaseOptions,
): void {
  try {
    const trackedQuery = tracker.toTrackedQuery();

    const parserContext: ErrorParserContext = {
      table: trackedQuery.table,
      operation: trackedQuery.operation,
      queryChain: trackedQuery.humanReadable,
    };

    const parsed = parseSupabaseError(reason, parserContext);

    addBreadcrumb({
      type: 'db_query',
      category: 'supabase.query',
      message: `Rejected: ${trackedQuery.humanReadable}`,
      data: {
        table: trackedQuery.table,
        operation: trackedQuery.operation,
        errorCode: parsed.errorCode,
      },
      level: 'error',
    });

    const operationInfo = tracker.toOperationInfo();
    operationInfo.errorCode = parsed.errorCode;
    operationInfo.errorDetails = parsed.humanExplanation;

    captureError(reason, {
      operation: operationInfo,
      extra: {
        supabase: {
          query: trackedQuery.humanReadable,
          table: trackedQuery.table,
          operation: trackedQuery.operation,
          parsedError: parsed,
        },
      },
    });
  } catch {
    // Never crash the host app
  }
}

// ---------------------------------------------------------------------------
// Auth proxy
// ---------------------------------------------------------------------------

/** Auth methods that should be intercepted. */
const AUTH_METHODS = new Set([
  'signUp',
  'signInWithPassword',
  'signInWithOtp',
  'signInWithOAuth',
  'signInWithIdToken',
  'signInWithSSO',
  'signOut',
  'getSession',
  'getUser',
  'refreshSession',
  'resetPasswordForEmail',
  'updateUser',
  'setSession',
  'exchangeCodeForSession',
  'reauthenticate',
  'resend',
  'verifyOtp',
]);

/**
 * Create a proxy around the Supabase auth object that tracks auth operations.
 */
function createAuthProxy(authTarget: object, options: WrapSupabaseOptions): object {
  return new Proxy(authTarget, {
    get(obj: object, prop: string | symbol, receiver: unknown): unknown {
      if (typeof prop === 'symbol') {
        try {
          return Reflect.get(obj, prop, receiver);
        } catch {
          return undefined;
        }
      }

      let value: unknown;
      try {
        value = Reflect.get(obj, prop, receiver);
      } catch {
        return undefined;
      }

      // Only intercept known auth methods
      if (typeof value !== 'function' || !AUTH_METHODS.has(prop)) {
        return value;
      }

      const methodName = prop;

      return function (this: unknown, ...args: unknown[]): unknown {
        // Sanitize auth arguments before recording
        const sanitizedArgs = args.map((arg) => {
          if (arg !== null && typeof arg === 'object') {
            return sanitizeAuthData(arg);
          }
          return arg;
        });

        let result: unknown;
        try {
          result = (value as Function).apply(obj, args);
        } catch (err) {
          handleAuthError(err, methodName, sanitizedArgs);
          throw err;
        }

        if (isThenable(result)) {
          return (result as Promise<unknown>).then(
            (resolved) => {
              handleAuthResult(resolved, methodName, sanitizedArgs);
              return resolved;
            },
            (rejected) => {
              handleAuthError(rejected, methodName, sanitizedArgs);
              return Promise.reject(rejected);
            },
          );
        }

        return result;
      };
    },
  });
}

/**
 * Handle a resolved auth result, checking for errors.
 */
function handleAuthResult(
  result: unknown,
  method: string,
  sanitizedArgs: unknown[],
): void {
  try {
    if (isSupabaseResult(result) && result.error) {
      const parsed = parseSupabaseError(result.error, { operation: method });

      addBreadcrumb({
        type: 'auth',
        category: 'supabase.auth',
        message: `Auth failed: ${method}`,
        data: {
          method,
          errorCode: parsed.errorCode,
          errorType: parsed.errorType,
        },
        level: 'error',
      });

      const operationInfo: OperationInfo = {
        provider: 'supabase',
        type: 'auth',
        method,
        params: sanitize(
          Object.fromEntries(
            sanitizedArgs.map((a, i) => [`arg${i}`, safeArgString(a)]),
          ),
        ),
        errorCode: parsed.errorCode,
        errorDetails: parsed.humanExplanation,
      };

      captureError(result.error, {
        operation: operationInfo,
        extra: {
          supabase: {
            subsystem: 'auth',
            method,
            parsedError: parsed,
          },
        },
      });
    } else {
      // Successful auth operation
      addBreadcrumb({
        type: 'auth',
        category: 'supabase.auth',
        message: `Auth OK: ${method}`,
        data: { method },
        level: 'info',
      });
    }
  } catch {
    // Never crash the host app
  }
}

/**
 * Handle a rejected auth Promise or synchronous throw.
 */
function handleAuthError(
  reason: unknown,
  method: string,
  sanitizedArgs: unknown[],
): void {
  try {
    const parsed = parseSupabaseError(reason, { operation: method });

    addBreadcrumb({
      type: 'auth',
      category: 'supabase.auth',
      message: `Auth rejected: ${method}`,
      data: {
        method,
        errorCode: parsed.errorCode,
      },
      level: 'error',
    });

    const operationInfo: OperationInfo = {
      provider: 'supabase',
      type: 'auth',
      method,
      params: sanitize(
        Object.fromEntries(
          sanitizedArgs.map((a, i) => [`arg${i}`, safeArgString(a)]),
        ),
      ),
      errorCode: parsed.errorCode,
      errorDetails: parsed.humanExplanation,
    };

    captureError(reason, {
      operation: operationInfo,
      extra: {
        supabase: {
          subsystem: 'auth',
          method,
          parsedError: parsed,
        },
      },
    });
  } catch {
    // Never crash the host app
  }
}

// ---------------------------------------------------------------------------
// Functions proxy
// ---------------------------------------------------------------------------

/**
 * Create a proxy around the Supabase functions object that intercepts .invoke().
 */
function createFunctionsProxy(
  functionsTarget: object,
  _options: WrapSupabaseOptions,
): object {
  return new Proxy(functionsTarget, {
    get(obj: object, prop: string | symbol, receiver: unknown): unknown {
      if (typeof prop === 'symbol') {
        try {
          return Reflect.get(obj, prop, receiver);
        } catch {
          return undefined;
        }
      }

      let value: unknown;
      try {
        value = Reflect.get(obj, prop, receiver);
      } catch {
        return undefined;
      }

      // Only intercept the .invoke() method
      if (typeof value !== 'function' || prop !== 'invoke') {
        return value;
      }

      return function (this: unknown, functionName: string, invokeOptions?: unknown): unknown {
        const sanitizedOptions = invokeOptions
          ? sanitizeAuthData(invokeOptions)
          : undefined;

        let result: unknown;
        try {
          result = (value as Function).apply(obj, [functionName, invokeOptions]);
        } catch (err) {
          handleFunctionsError(err, functionName, sanitizedOptions);
          throw err;
        }

        if (isThenable(result)) {
          return (result as Promise<unknown>).then(
            (resolved) => {
              handleFunctionsResult(resolved, functionName, sanitizedOptions);
              return resolved;
            },
            (rejected) => {
              handleFunctionsError(rejected, functionName, sanitizedOptions);
              return Promise.reject(rejected);
            },
          );
        }

        return result;
      };
    },
  });
}

/**
 * Handle a resolved edge function invocation result.
 */
function handleFunctionsResult(
  result: unknown,
  functionName: string,
  sanitizedOptions: unknown,
): void {
  try {
    if (isSupabaseResult(result) && result.error) {
      const parsed = parseSupabaseError(result.error, {
        functionName,
        operation: 'invoke',
      });

      addBreadcrumb({
        type: 'api_call',
        category: 'supabase.functions',
        message: `Function failed: ${functionName}`,
        data: {
          functionName,
          errorCode: parsed.errorCode,
          errorType: parsed.errorType,
        },
        level: 'error',
      });

      const operationInfo: OperationInfo = {
        provider: 'supabase',
        type: 'functions',
        method: 'invoke',
        params: {
          functionName,
          options: safeArgString(sanitizedOptions),
        },
        errorCode: parsed.errorCode,
        errorDetails: parsed.humanExplanation,
      };

      captureError(result.error, {
        operation: operationInfo,
        extra: {
          supabase: {
            subsystem: 'functions',
            functionName,
            parsedError: parsed,
          },
        },
      });
    } else {
      addBreadcrumb({
        type: 'api_call',
        category: 'supabase.functions',
        message: `Function OK: ${functionName}`,
        data: { functionName },
        level: 'info',
      });
    }
  } catch {
    // Never crash the host app
  }
}

/**
 * Handle a rejected edge function invocation.
 */
function handleFunctionsError(
  reason: unknown,
  functionName: string,
  sanitizedOptions: unknown,
): void {
  try {
    const parsed = parseSupabaseError(reason, {
      functionName,
      operation: 'invoke',
    });

    addBreadcrumb({
      type: 'api_call',
      category: 'supabase.functions',
      message: `Function rejected: ${functionName}`,
      data: {
        functionName,
        errorCode: parsed.errorCode,
      },
      level: 'error',
    });

    const operationInfo: OperationInfo = {
      provider: 'supabase',
      type: 'functions',
      method: 'invoke',
      params: {
        functionName,
        options: safeArgString(sanitizedOptions),
      },
      errorCode: parsed.errorCode,
      errorDetails: parsed.humanExplanation,
    };

    captureError(reason, {
      operation: operationInfo,
      extra: {
        supabase: {
          subsystem: 'functions',
          functionName,
          parsedError: parsed,
        },
      },
    });
  } catch {
    // Never crash the host app
  }
}

// ---------------------------------------------------------------------------
// Storage proxy
// ---------------------------------------------------------------------------

/** Storage methods that should be intercepted. */
const STORAGE_METHODS = new Set([
  'upload',
  'download',
  'remove',
  'list',
  'move',
  'copy',
  'createSignedUrl',
  'createSignedUrls',
  'getPublicUrl',
]);

/**
 * Create a proxy around a Supabase storage bucket (from .storage.from('bucket')).
 */
function createStorageBucketProxy(
  bucketTarget: object,
  bucketName: string,
  _options: WrapSupabaseOptions,
): object {
  return new Proxy(bucketTarget, {
    get(obj: object, prop: string | symbol, receiver: unknown): unknown {
      if (typeof prop === 'symbol') {
        try {
          return Reflect.get(obj, prop, receiver);
        } catch {
          return undefined;
        }
      }

      let value: unknown;
      try {
        value = Reflect.get(obj, prop, receiver);
      } catch {
        return undefined;
      }

      if (typeof value !== 'function' || !STORAGE_METHODS.has(prop)) {
        return value;
      }

      const methodName = prop;

      return function (this: unknown, ...args: unknown[]): unknown {
        let result: unknown;
        try {
          result = (value as Function).apply(obj, args);
        } catch (err) {
          handleStorageError(err, bucketName, methodName, args);
          throw err;
        }

        if (isThenable(result)) {
          return (result as Promise<unknown>).then(
            (resolved) => {
              handleStorageResult(resolved, bucketName, methodName, args);
              return resolved;
            },
            (rejected) => {
              handleStorageError(rejected, bucketName, methodName, args);
              return Promise.reject(rejected);
            },
          );
        }

        return result;
      };
    },
  });
}

/**
 * Handle a resolved storage operation result.
 */
function handleStorageResult(
  result: unknown,
  bucketName: string,
  method: string,
  args: unknown[],
): void {
  try {
    if (isSupabaseResult(result) && result.error) {
      const parsed = parseSupabaseError(result.error, {
        bucketName,
        operation: method,
      });

      addBreadcrumb({
        type: 'api_call',
        category: 'supabase.storage',
        message: `Storage failed: ${method} on ${bucketName}`,
        data: {
          bucket: bucketName,
          method,
          errorCode: parsed.errorCode,
        },
        level: 'error',
      });

      const operationInfo: OperationInfo = {
        provider: 'supabase',
        type: 'storage',
        method,
        params: {
          bucket: bucketName,
          path: typeof args[0] === 'string' ? args[0] : undefined,
        },
        errorCode: parsed.errorCode,
        errorDetails: parsed.humanExplanation,
      };

      captureError(result.error, {
        operation: operationInfo,
        extra: {
          supabase: {
            subsystem: 'storage',
            bucket: bucketName,
            method,
            parsedError: parsed,
          },
        },
      });
    } else {
      addBreadcrumb({
        type: 'api_call',
        category: 'supabase.storage',
        message: `Storage OK: ${method} on ${bucketName}`,
        data: { bucket: bucketName, method },
        level: 'info',
      });
    }
  } catch {
    // Never crash the host app
  }
}

/**
 * Handle a rejected storage operation.
 */
function handleStorageError(
  reason: unknown,
  bucketName: string,
  method: string,
  args: unknown[],
): void {
  try {
    const parsed = parseSupabaseError(reason, {
      bucketName,
      operation: method,
    });

    addBreadcrumb({
      type: 'api_call',
      category: 'supabase.storage',
      message: `Storage rejected: ${method} on ${bucketName}`,
      data: {
        bucket: bucketName,
        method,
        errorCode: parsed.errorCode,
      },
      level: 'error',
    });

    const operationInfo: OperationInfo = {
      provider: 'supabase',
      type: 'storage',
      method,
      params: {
        bucket: bucketName,
        path: typeof args[0] === 'string' ? args[0] : undefined,
      },
      errorCode: parsed.errorCode,
      errorDetails: parsed.humanExplanation,
    };

    captureError(reason, {
      operation: operationInfo,
      extra: {
        supabase: {
          subsystem: 'storage',
          bucket: bucketName,
          method,
          parsedError: parsed,
        },
      },
    });
  } catch {
    // Never crash the host app
  }
}

/**
 * Create a proxy around the Supabase storage object that intercepts
 * .from('bucket') to return a proxied bucket client.
 */
function createStorageProxy(
  storageTarget: object,
  options: WrapSupabaseOptions,
): object {
  return new Proxy(storageTarget, {
    get(obj: object, prop: string | symbol, receiver: unknown): unknown {
      if (typeof prop === 'symbol') {
        try {
          return Reflect.get(obj, prop, receiver);
        } catch {
          return undefined;
        }
      }

      let value: unknown;
      try {
        value = Reflect.get(obj, prop, receiver);
      } catch {
        return undefined;
      }

      // Intercept .from('bucketName') to return a proxied bucket client
      if (typeof value === 'function' && prop === 'from') {
        return function (this: unknown, bucketName: string): unknown {
          const bucketClient = (value as Function).apply(obj, [bucketName]);
          if (bucketClient !== null && typeof bucketClient === 'object') {
            return createStorageBucketProxy(bucketClient as object, bucketName, options);
          }
          return bucketClient;
        };
      }

      return value;
    },
  });
}

// ---------------------------------------------------------------------------
// Top-level SupabaseClient proxy
// ---------------------------------------------------------------------------

/**
 * Resolved options with defaults applied.
 */
function resolveOptions(options: WrapSupabaseOptions): Required<WrapSupabaseOptions> {
  return {
    trackQueries: options.trackQueries ?? true,
    trackAuth: options.trackAuth ?? true,
    trackFunctions: options.trackFunctions ?? true,
    trackStorage: options.trackStorage ?? false,
    trackRealtime: options.trackRealtime ?? false,
  };
}

/**
 * Create the top-level deep Proxy around a SupabaseClient.
 *
 * This is the main entry point. The returned Proxy intercepts access to
 * `.from()`, `.auth`, `.functions`, and `.storage` to create sub-proxies
 * that track operations and capture errors.
 *
 * The Proxy is fully transparent:
 * - typeof and instanceof work as expected
 * - TypeScript types pass through unchanged
 * - No observable behavior change when there are no errors
 * - Negligible performance overhead (one Proxy get trap per property access)
 *
 * @param client  - The original SupabaseClient instance.
 * @param options - Configuration for which subsystems to track.
 * @returns A proxied version of the client with identical type and behavior.
 */
export function createSupabaseProxy(
  client: unknown,
  options: WrapSupabaseOptions,
): unknown {
  // Safety: if the client is null/undefined or not an object, return as-is
  if (client === null || client === undefined) return client;
  if (typeof client !== 'object' && typeof client !== 'function') return client;

  const resolved = resolveOptions(options);

  return new Proxy(client as object, {
    get(obj: object, prop: string | symbol, receiver: unknown): unknown {
      // Pass through symbols transparently (supports typeof, instanceof, etc.)
      if (typeof prop === 'symbol') {
        try {
          return Reflect.get(obj, prop, receiver);
        } catch {
          return undefined;
        }
      }

      let value: unknown;
      try {
        value = Reflect.get(obj, prop, receiver);
      } catch {
        return undefined;
      }

      // ----- .from('table') — database query builder -----
      if (prop === 'from' && typeof value === 'function' && resolved.trackQueries) {
        return function (this: unknown, ...args: unknown[]): unknown {
          const tracker = new QueryTracker();
          tracker.track('from', args);

          let result: unknown;
          try {
            result = (value as Function).apply(obj, args);
          } catch (err) {
            handleQueryError(err, tracker, resolved);
            throw err;
          }

          if (result !== null && typeof result === 'object') {
            return createQueryBuilderProxy(result, tracker, resolved);
          }
          return result;
        };
      }

      // ----- .rpc('fn_name', params) — RPC call -----
      if (prop === 'rpc' && typeof value === 'function' && resolved.trackQueries) {
        return function (this: unknown, ...args: unknown[]): unknown {
          const tracker = new QueryTracker();
          tracker.track('rpc', args);

          let result: unknown;
          try {
            result = (value as Function).apply(obj, args);
          } catch (err) {
            handleQueryError(err, tracker, resolved);
            throw err;
          }

          if (isThenable(result)) {
            return createQueryBuilderProxy(result, tracker, resolved);
          }

          if (result !== null && typeof result === 'object') {
            return createQueryBuilderProxy(result, tracker, resolved);
          }

          return result;
        };
      }

      // ----- .auth — auth operations -----
      if (prop === 'auth' && resolved.trackAuth) {
        if (value !== null && typeof value === 'object') {
          return createAuthProxy(value as object, resolved);
        }
      }

      // ----- .functions — edge function invocations -----
      if (prop === 'functions' && resolved.trackFunctions) {
        if (value !== null && typeof value === 'object') {
          return createFunctionsProxy(value as object, resolved);
        }
      }

      // ----- .storage — storage operations -----
      if (prop === 'storage' && resolved.trackStorage) {
        if (value !== null && typeof value === 'object') {
          return createStorageProxy(value as object, resolved);
        }
      }

      // ----- Everything else passes through -----
      return value;
    },

    // Ensure all other traps pass through transparently
    set(obj: object, prop: string | symbol, value: unknown, receiver: unknown): boolean {
      return Reflect.set(obj, prop, value, receiver);
    },

    has(obj: object, prop: string | symbol): boolean {
      return Reflect.has(obj, prop);
    },

    deleteProperty(obj: object, prop: string | symbol): boolean {
      return Reflect.deleteProperty(obj, prop);
    },

    ownKeys(obj: object): ArrayLike<string | symbol> {
      return Reflect.ownKeys(obj);
    },

    getOwnPropertyDescriptor(
      obj: object,
      prop: string | symbol,
    ): PropertyDescriptor | undefined {
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },

    getPrototypeOf(obj: object): object | null {
      return Reflect.getPrototypeOf(obj);
    },

    isExtensible(obj: object): boolean {
      return Reflect.isExtensible(obj);
    },

    preventExtensions(obj: object): boolean {
      return Reflect.preventExtensions(obj);
    },

    defineProperty(
      obj: object,
      prop: string | symbol,
      descriptor: PropertyDescriptor,
    ): boolean {
      return Reflect.defineProperty(obj, prop, descriptor);
    },

    setPrototypeOf(obj: object, proto: object | null): boolean {
      return Reflect.setPrototypeOf(obj, proto);
    },
  });
}
