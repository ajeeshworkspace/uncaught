// ---------------------------------------------------------------------------
// @uncaughtdev/core — Next.js Pages Router local API handler
// ---------------------------------------------------------------------------
//
// Usage:
//   // pages/api/uncaught/local.ts
//   export { default } from '@uncaughtdev/core/local-api-handler/pages';
//
// ---------------------------------------------------------------------------

import type { UncaughtEvent } from './types';
import { writeEvents } from './local-api-handler';

/**
 * Minimal type for the Next.js Pages API request.
 * We intentionally avoid importing `next` so that `@uncaughtdev/core` has
 * zero runtime dependencies.
 */
interface PagesApiRequest {
  method?: string;
  body?: unknown;
}

/**
 * Minimal type for the Next.js Pages API response.
 */
interface PagesApiResponse {
  status: (code: number) => PagesApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => PagesApiResponse;
  end?: () => void;
}

/**
 * Next.js Pages Router API handler (`/pages/api/uncaught/local.ts`).
 *
 * Accepts POST requests with `{ events: UncaughtEvent[] }` and writes them
 * to `.uncaught/`.
 *
 * Blocked in production unless `UNCAUGHT_LOCAL_IN_PROD=true` is set.
 */
export default async function handler(
  req: PagesApiRequest,
  res: PagesApiResponse
): Promise<void> {
  try {
    // --- Method check ------------------------------------------------------
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // --- Production guard --------------------------------------------------
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV === 'production' &&
      process.env.UNCAUGHT_LOCAL_IN_PROD !== 'true'
    ) {
      res.status(403).json({ error: 'Local handler is disabled in production' });
      return;
    }

    // --- Validate body -----------------------------------------------------
    const body = req.body;

    if (
      !body ||
      typeof body !== 'object' ||
      !Array.isArray((body as Record<string, unknown>).events)
    ) {
      res.status(400).json({ error: 'Payload must contain an "events" array' });
      return;
    }

    const events = (body as { events: UncaughtEvent[] }).events;

    if (events.length === 0) {
      res.status(202).json({ accepted: 0 });
      return;
    }

    // --- Write events to disk ----------------------------------------------
    await writeEvents(events);

    res.status(202).json({ accepted: events.length });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
}
