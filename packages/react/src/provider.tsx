'use client';

import React, { useEffect, useRef, useState } from 'react';
import { initUncaught } from '@uncaught/core';
import type { UncaughtClient } from '@uncaught/core';
import { UncaughtContext } from './context';
import { UncaughtErrorBoundary } from './error-boundary';
import { setupGlobalHandlers } from './global-handlers';
import { setupDomBreadcrumbs } from './dom-breadcrumbs';
import { setupNextJsNavigation, detectNextJs } from './next-integration';
import type { UncaughtProviderProps } from './types';

/**
 * UncaughtProvider initializes the Uncaught error monitoring client and
 * provides it to all descendant components via React context.
 *
 * It automatically:
 * - Initializes the UncaughtClient with the provided configuration
 * - Sets up global error handlers (window.onerror, unhandledrejection)
 * - Sets up DOM breadcrumb tracking (clicks, navigation, fetch)
 * - Detects and integrates with Next.js routing if present
 * - Wraps children in an error boundary
 * - Cleans up all listeners on unmount
 *
 * Usage:
 * ```tsx
 * <UncaughtProvider dsn="your-dsn" environment="production">
 *   <App />
 * </UncaughtProvider>
 * ```
 *
 * @param props - Configuration props extending UncaughtConfig plus children, fallback, and showDialog.
 */
export function UncaughtProvider({
  children,
  fallback,
  showDialog,
  ...config
}: UncaughtProviderProps): React.ReactElement {
  const [client, setClient] = useState<UncaughtClient | null>(null);
  const cleanupRef = useRef<Array<() => void>>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent double-initialization in React StrictMode
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    let mounted = true;
    const cleanups: Array<() => void> = [];

    try {
      // Strip React-specific props before passing to core
      const { __nextjs, ...coreConfig } = config as Record<string, unknown> & {
        __nextjs?: boolean;
      };

      // Initialize the core client
      const uncaughtClient = initUncaught(
        coreConfig as Parameters<typeof initUncaught>[0]
      );

      if (!uncaughtClient) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[Uncaught] initUncaught returned null/undefined. Error monitoring is disabled.'
          );
        }
        return;
      }

      // Set up global error handlers
      try {
        const cleanupGlobal = setupGlobalHandlers(uncaughtClient);
        cleanups.push(cleanupGlobal);
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[Uncaught] Failed to set up global handlers:',
            e
          );
        }
      }

      // Set up DOM breadcrumbs
      try {
        const cleanupDom = setupDomBreadcrumbs(uncaughtClient);
        cleanups.push(cleanupDom);
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[Uncaught] Failed to set up DOM breadcrumbs:',
            e
          );
        }
      }

      // Set up Next.js integration if detected or explicitly configured
      if (typeof window !== 'undefined') {
        try {
          const nextDetection = detectNextJs();
          if (nextDetection.isNextJs || __nextjs) {
            const cleanupNext = setupNextJsNavigation(uncaughtClient);
            cleanups.push(cleanupNext);
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.error(
              '[Uncaught] Failed to set up Next.js integration:',
              e
            );
          }
        }
      }

      // Store cleanups for unmount
      cleanupRef.current = cleanups;

      // Only update state if still mounted
      if (mounted) {
        setClient(uncaughtClient);
      }
    } catch (e) {
      // Never crash the host app during initialization
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to initialize:', e);
      }
    }

    return () => {
      mounted = false;
      // Run all cleanup functions
      cleanupRef.current.forEach((cleanup) => {
        try {
          cleanup();
        } catch {
          // Silently ignore cleanup failures
        }
      });
      cleanupRef.current = [];
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initialize once on mount - config changes require remounting

  const contextValue = React.useMemo(() => ({ client }), [client]);

  return (
    <UncaughtContext.Provider value={contextValue}>
      <UncaughtErrorBoundary fallback={fallback} showDialog={showDialog}>
        {children}
      </UncaughtErrorBoundary>
    </UncaughtContext.Provider>
  );
}
