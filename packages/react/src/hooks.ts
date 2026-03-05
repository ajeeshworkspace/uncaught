'use client';

import { useContext, useCallback } from 'react';
import type { UncaughtClient, Breadcrumb } from '@uncaught/core';
import { UncaughtContext } from './context';

/**
 * Returns the UncaughtClient instance from context.
 * Must be called within an UncaughtProvider.
 *
 * @throws {Error} If called outside of an UncaughtProvider.
 * @returns The UncaughtClient instance.
 */
export function useUncaught(): UncaughtClient {
  const { client } = useContext(UncaughtContext);

  if (!client) {
    throw new Error(
      'useUncaught must be used within an <UncaughtProvider>. ' +
        'Wrap your application in <UncaughtProvider> to use this hook.'
    );
  }

  return client;
}

/**
 * Returns a function that reports an error to Uncaught.
 * Safe to call even if the client is not yet initialized (will silently no-op).
 *
 * @returns A function `(error: Error, context?: Record<string, unknown>) => void`
 */
export function useReportError(): (
  error: Error,
  context?: Record<string, unknown>
) => void {
  const { client } = useContext(UncaughtContext);

  return useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      try {
        if (!client) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              '[Uncaught] useReportError called but no UncaughtClient is available. ' +
                'Make sure <UncaughtProvider> is mounted.'
            );
          }
          return;
        }

        client.captureError(error);
      } catch (e) {
        // Never crash the host app
        if (process.env.NODE_ENV === 'development') {
          console.error('[Uncaught] Failed to report error:', e);
        }
      }
    },
    [client]
  );
}

/**
 * Returns a function that adds a breadcrumb to the current Uncaught session.
 * Safe to call even if the client is not yet initialized (will silently no-op).
 *
 * @returns A function `(breadcrumb: Partial<Breadcrumb>) => void`
 */
export function useBreadcrumb(): (breadcrumb: Partial<Breadcrumb>) => void {
  const { client } = useContext(UncaughtContext);

  return useCallback(
    (breadcrumb: Partial<Breadcrumb>) => {
      try {
        if (!client) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              '[Uncaught] useBreadcrumb called but no UncaughtClient is available. ' +
                'Make sure <UncaughtProvider> is mounted.'
            );
          }
          return;
        }

        client.addBreadcrumb({
          type: breadcrumb.type ?? 'custom',
          category: breadcrumb.category ?? 'custom',
          message: breadcrumb.message ?? '',
          level: breadcrumb.level ?? 'info',
          data: breadcrumb.data,
        });
      } catch (e) {
        // Never crash the host app
        if (process.env.NODE_ENV === 'development') {
          console.error('[Uncaught] Failed to add breadcrumb:', e);
        }
      }
    },
    [client]
  );
}
