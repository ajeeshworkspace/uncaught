// ---------------------------------------------------------------------------
// @uncaught/core — Next.js App Router local API handler
// ---------------------------------------------------------------------------
//
// Usage:
//   // app/api/uncaught/local/route.ts
//   export { POST } from '@uncaught/core/local-api-handler';
//
// ---------------------------------------------------------------------------

import type { UncaughtEvent, IssueEntry } from './types';
import { safeStringify } from './utils';

/**
 * Next.js App Router POST handler.
 * Accepts `{ events: UncaughtEvent[] }` and writes them to `.uncaught/`.
 *
 * Blocked in production unless `UNCAUGHT_LOCAL_IN_PROD=true` is set.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // --- Production guard --------------------------------------------------
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV === 'production' &&
      process.env.UNCAUGHT_LOCAL_IN_PROD !== 'true'
    ) {
      return new Response(
        JSON.stringify({ error: 'Local handler is disabled in production' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- Parse body --------------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !Array.isArray((body as Record<string, unknown>).events)
    ) {
      return new Response(
        JSON.stringify({ error: 'Payload must contain an "events" array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const events = (body as { events: UncaughtEvent[] }).events;

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ accepted: 0 }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- Write events to disk ----------------------------------------------
    await writeEvents(events);

    return new Response(
      JSON.stringify({ accepted: events.length }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ---------------------------------------------------------------------------
// Shared disk-writing logic
// ---------------------------------------------------------------------------

export async function writeEvents(events: UncaughtEvent[]): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const baseDir = path.resolve(process.cwd(), '.uncaught');
  await fs.mkdir(path.join(baseDir, 'events'), { recursive: true });
  await fs.mkdir(path.join(baseDir, 'fix-prompts'), { recursive: true });

  // Load existing issues index
  const indexPath = path.join(baseDir, 'issues.json');
  let issues: IssueEntry[] = [];
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    issues = JSON.parse(raw) as IssueEntry[];
  } catch {
    // Start fresh.
  }

  for (const event of events) {
    const fp = event.fingerprint;
    if (!fp) continue;

    const eventDir = path.join(baseDir, 'events', fp);
    await fs.mkdir(eventDir, { recursive: true });

    // Timestamped event file
    const ts = (event.timestamp ?? new Date().toISOString()).replace(
      /[:.]/g,
      '-'
    );
    const eventFile = `event-${ts}.json`;
    const eventPath = path.join(eventDir, eventFile);
    const tmpEvent = eventPath + '.tmp';
    await fs.writeFile(tmpEvent, safeStringify(event), 'utf-8');
    await fs.rename(tmpEvent, eventPath);

    // latest.json
    const latestPath = path.join(eventDir, 'latest.json');
    const tmpLatest = latestPath + '.tmp';
    await fs.writeFile(tmpLatest, safeStringify(event), 'utf-8');
    await fs.rename(tmpLatest, latestPath);

    // Fix-prompt markdown
    const promptFile = `${fp}.md`;
    const promptPath = path.join(baseDir, 'fix-prompts', promptFile);
    const tmpPrompt = promptPath + '.tmp';
    await fs.writeFile(tmpPrompt, event.fixPrompt ?? '', 'utf-8');
    await fs.rename(tmpPrompt, promptPath);

    // Update issues index
    const userId =
      (event.user as Record<string, unknown> | undefined)?.id ??
      (event.user as Record<string, unknown> | undefined)?.email ??
      'anonymous';

    const existing = issues.find((i) => i.fingerprint === fp);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = event.timestamp;
      existing.latestEventFile = eventFile;
      existing.fixPromptFile = promptFile;
      if (!existing.affectedUsers.includes(String(userId))) {
        existing.affectedUsers.push(String(userId));
      }
      if (existing.status === 'resolved') {
        existing.status = 'open';
      }
    } else {
      issues.push({
        fingerprint: fp,
        title: event.error?.message ?? 'Unknown error',
        errorType: event.error?.type ?? 'Error',
        count: 1,
        affectedUsers: [String(userId)],
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        status: 'open',
        fixPromptFile: promptFile,
        latestEventFile: eventFile,
      });
    }
  }

  // Write updated index atomically
  const tmpIndex = indexPath + '.tmp';
  await fs.writeFile(tmpIndex, JSON.stringify(issues, null, 2), 'utf-8');
  await fs.rename(tmpIndex, indexPath);
}
