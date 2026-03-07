// ---------------------------------------------------------------------------
// @uncaughtdev/core — transport layer (console / local-file / remote)
// ---------------------------------------------------------------------------

import type {
  Transport,
  UncaughtConfig,
  UncaughtEvent,
  IssueEntry,
} from './types';
import { safeStringify } from './utils';

// ===================================================================
// Factory
// ===================================================================

/**
 * Create the appropriate transport strategy based on config.
 */
export function createTransport(config: UncaughtConfig): Transport {
  const mode = config.transport ?? 'local';

  switch (mode) {
    case 'console':
      return createConsoleTransport(config);
    case 'remote':
      return createRemoteTransport(config);
    case 'local':
    default:
      return createLocalTransport(config);
  }
}

// ===================================================================
// Console Transport
// ===================================================================

function createConsoleTransport(_config: UncaughtConfig): Transport {
  return {
    send(event: UncaughtEvent): void {
      try {
        const title = `[uncaught] ${event.error.type}: ${event.error.message}`;

        if (typeof console.group === 'function') {
          console.group(title);
        } else {
          console.log(`--- ${title} ---`);
        }

        console.error('Error:', event.error.message);
        if (event.error.stack) {
          console.log('Stack:', event.error.stack);
        }
        console.log('Event ID:', event.eventId);
        console.log('Fingerprint:', event.fingerprint);
        console.log('Breadcrumbs:', event.breadcrumbs);

        if (event.fixPrompt) {
          console.log('Fix Prompt:\n', event.fixPrompt);
        }

        if (typeof console.groupEnd === 'function') {
          console.groupEnd();
        }
      } catch {
        // Never throw from transport.
      }
    },

    async flush(): Promise<void> {
      // Nothing to flush for console transport.
    },
  };
}

// ===================================================================
// Local File Transport
// ===================================================================

/**
 * The local transport behaves differently depending on whether `fs` is
 * available (server / Node.js) or not (browser).
 *
 * **Server:** writes events directly to the `.uncaught/` directory.
 * **Browser:** POSTs to `/api/uncaught/local` and falls back to console.
 */
function createLocalTransport(config: UncaughtConfig): Transport {
  // Detect server vs browser at transport creation time.
  const isServer = typeof process !== 'undefined' && process.versions?.node != null;

  if (isServer) {
    return createLocalFileTransport(config);
  }

  return createLocalClientTransport(config);
}

// ---------------------------------------------------------------------------
// Local File Transport (Server / Node.js)
// ---------------------------------------------------------------------------

interface FsModule {
  mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
  writeFile: (path: string, data: string, encoding: string) => Promise<void>;
  readFile: (path: string, encoding: string) => Promise<string>;
  rename: (from: string, to: string) => Promise<void>;
  access: (path: string) => Promise<void>;
  appendFile: (path: string, data: string) => Promise<void>;
}

interface PathModule {
  join: (...parts: string[]) => string;
  resolve: (...parts: string[]) => string;
}

function createLocalFileTransport(config: UncaughtConfig): Transport {
  let fsPromises: FsModule | undefined;
  let pathModule: PathModule | undefined;
  let baseDir: string = '';
  let initialised = false;

  async function init(): Promise<void> {
    if (initialised) return;

    // Dynamic imports so this module can still be loaded in browsers without
    // causing a hard crash at parse time.
    const fs = await import('fs/promises');
    const path = await import('path');
    fsPromises = fs as unknown as FsModule;
    pathModule = path as unknown as PathModule;

    baseDir = config.localOutputDir ?? pathModule.resolve(process.cwd(), '.uncaught');

    // Ensure directory structure
    await fsPromises.mkdir(pathModule.join(baseDir, 'events'), { recursive: true });
    await fsPromises.mkdir(pathModule.join(baseDir, 'fix-prompts'), { recursive: true });

    // Auto-add .uncaught/ to .gitignore
    await ensureGitignore(fsPromises, pathModule);

    initialised = true;
  }

  async function ensureGitignore(fs: FsModule, path: PathModule): Promise<void> {
    try {
      const gitignorePath = path.resolve(process.cwd(), '.gitignore');
      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // File doesn't exist yet — that's fine.
      }

      if (!content.includes('.uncaught')) {
        const line = '\n# Uncaught local error store\n.uncaught/\n';
        await fs.appendFile(gitignorePath, line);
      }
    } catch {
      // Non-critical — swallow.
    }
  }

  return {
    async send(event: UncaughtEvent): Promise<void> {
      try {
        await init();
        if (!fsPromises || !pathModule) return;

        const fp = event.fingerprint;
        const eventDir = pathModule.join(baseDir, 'events', fp);
        await fsPromises.mkdir(eventDir, { recursive: true });

        // --- Write timestamped event file (atomic: .tmp → rename) ----------
        const ts = event.timestamp.replace(/[:.]/g, '-');
        const eventFile = `event-${ts}.json`;
        const eventPath = pathModule.join(eventDir, eventFile);
        const tmpEventPath = eventPath + '.tmp';
        await fsPromises.writeFile(tmpEventPath, safeStringify(event), 'utf-8');
        await fsPromises.rename(tmpEventPath, eventPath);

        // --- Write / overwrite latest.json ---------------------------------
        const latestPath = pathModule.join(eventDir, 'latest.json');
        const tmpLatestPath = latestPath + '.tmp';
        await fsPromises.writeFile(tmpLatestPath, safeStringify(event), 'utf-8');
        await fsPromises.rename(tmpLatestPath, latestPath);

        // --- Write fix-prompt Markdown file --------------------------------
        const promptFile = `${fp}.md`;
        const promptPath = pathModule.join(baseDir, 'fix-prompts', promptFile);
        const tmpPromptPath = promptPath + '.tmp';
        await fsPromises.writeFile(tmpPromptPath, event.fixPrompt, 'utf-8');
        await fsPromises.rename(tmpPromptPath, promptPath);

        // --- Update issues.json index -------------------------------------
        await updateIssuesIndex(
          fsPromises,
          pathModule,
          baseDir,
          event,
          eventFile,
          promptFile
        );

        // --- Also write to SQLite -----------------------------------------
        try {
          const { openStore } = await import('./sqlite-store');
          const dbPath = pathModule.join(baseDir, 'uncaught.db');
          const store = openStore(dbPath);
          store.insertEvent(event);
          store.close();
        } catch {
          // SQLite is best-effort
        }
      } catch {
        // Never crash the host app.
      }
    },

    async flush(): Promise<void> {
      // Local file transport writes synchronously per-event; nothing to flush.
    },
  };
}

/**
 * Read, update, and atomically write the `issues.json` index.
 */
async function updateIssuesIndex(
  fs: FsModule,
  path: PathModule,
  baseDir: string,
  event: UncaughtEvent,
  eventFile: string,
  promptFile: string
): Promise<void> {
  const indexPath = path.join(baseDir, 'issues.json');

  let issues: IssueEntry[] = [];
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    issues = JSON.parse(raw) as IssueEntry[];
  } catch {
    // File doesn't exist or is malformed — start fresh.
  }

  const existing = issues.find((i) => i.fingerprint === event.fingerprint);
  const userId = event.user?.id ?? event.user?.email ?? 'anonymous';

  if (existing) {
    existing.count += 1;
    existing.lastSeen = event.timestamp;
    existing.latestEventFile = eventFile;
    existing.fixPromptFile = promptFile;
    if (!existing.affectedUsers.includes(userId)) {
      existing.affectedUsers.push(userId);
    }
    // Re-open if previously resolved
    if (existing.status === 'resolved') {
      existing.status = 'open';
    }
  } else {
    issues.push({
      fingerprint: event.fingerprint,
      title: event.error.message,
      errorType: event.error.type,
      count: 1,
      affectedUsers: [userId],
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      status: 'open',
      fixPromptFile: promptFile,
      latestEventFile: eventFile,
      release: event.release,
      environment: event.environment?.deploy,
    });
  }

  const tmpIndexPath = indexPath + '.tmp';
  await fs.writeFile(tmpIndexPath, JSON.stringify(issues, null, 2), 'utf-8');
  await fs.rename(tmpIndexPath, indexPath);
}

// ---------------------------------------------------------------------------
// Local Client Transport (Browser → POST /api/uncaught/local)
// ---------------------------------------------------------------------------

function createLocalClientTransport(_config: UncaughtConfig): Transport {
  const queue: UncaughtEvent[] = [];
  const consoleFallback = createConsoleTransport(_config);

  async function postEvents(events: UncaughtEvent[]): Promise<boolean> {
    try {
      const res = await fetch('/api/uncaught/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeStringify({ events }),
      });

      return res.ok || res.status === 202;
    } catch {
      return false;
    }
  }

  return {
    send(event: UncaughtEvent): void {
      queue.push(event);

      // Attempt to send immediately
      postEvents([event]).then((ok) => {
        if (!ok) {
          // Fallback to console
          consoleFallback.send(event);
        }
      }).catch(() => {
        consoleFallback.send(event);
      });
    },

    async flush(): Promise<void> {
      if (queue.length === 0) return;

      const batch = queue.splice(0, queue.length);
      const ok = await postEvents(batch);
      if (!ok) {
        // Fallback: log remaining to console
        for (const event of batch) {
          consoleFallback.send(event);
        }
      }
    },
  };
}

// ===================================================================
// Remote Transport
// ===================================================================

function createRemoteTransport(config: UncaughtConfig): Transport {
  const endpoint = config.endpoint ?? '';
  const projectKey = config.projectKey ?? '';
  const maxRetries = 3;
  const batchSize = 10;
  const flushIntervalMs = 5_000;

  const queue: UncaughtEvent[] = [];
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  // Backoff delays in ms for retries (1s, 2s, 4s)
  const backoffDelays = [1000, 2000, 4000];

  async function sendBatch(events: UncaughtEvent[]): Promise<void> {
    if (events.length === 0 || stopped) return;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(projectKey ? { 'X-Project-Key': projectKey } : {}),
          },
          body: safeStringify({ events }),
        });

        if (res.ok || res.status === 202) {
          return; // Success
        }

        if (res.status === 401) {
          // Unauthorized — stop sending entirely.
          stopped = true;
          if (flushTimer) clearInterval(flushTimer);
          return;
        }

        if (res.status === 429) {
          // Rate limited — use longer backoff
          const retryAfter = parseInt(
            res.headers?.get?.('Retry-After') ?? '10',
            10
          );
          await sleep(retryAfter * 1000);
          continue;
        }

        // Other server errors — retry with backoff
        if (attempt < maxRetries) {
          await sleep(backoffDelays[attempt] ?? 4000);
        }
      } catch {
        // Network error — retry
        if (attempt < maxRetries) {
          await sleep(backoffDelays[attempt] ?? 4000);
        }
      }
    }
    // All retries exhausted — events are dropped silently.
  }

  function startFlushing(): void {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      if (queue.length > 0) {
        const batch = queue.splice(0, batchSize);
        sendBatch(batch).catch(() => {
          // Swallow — never crash.
        });
      }
    }, flushIntervalMs);

    // Ensure the timer does not prevent Node.js from exiting.
    if (typeof flushTimer === 'object' && 'unref' in flushTimer) {
      (flushTimer as { unref: () => void }).unref();
    }
  }

  // Register sendBeacon on page unload (browser only)
  function registerBeacon(): void {
    try {
      if (
        typeof window !== 'undefined' &&
        typeof navigator?.sendBeacon === 'function'
      ) {
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden' && queue.length > 0) {
            const payload = safeStringify({ events: queue.splice(0, queue.length) });
            navigator.sendBeacon(endpoint, payload);
          }
        });

        window.addEventListener('pagehide', () => {
          if (queue.length > 0) {
            const payload = safeStringify({ events: queue.splice(0, queue.length) });
            navigator.sendBeacon(endpoint, payload);
          }
        });
      }
    } catch {
      // Not in a browser — that's fine.
    }
  }

  startFlushing();
  registerBeacon();

  return {
    send(event: UncaughtEvent): void {
      if (stopped) return;

      queue.push(event);

      // Flush immediately if batch size reached
      if (queue.length >= batchSize) {
        const batch = queue.splice(0, batchSize);
        sendBatch(batch).catch(() => {
          // Swallow.
        });
      }
    },

    async flush(): Promise<void> {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = undefined;
      }

      while (queue.length > 0) {
        const batch = queue.splice(0, batchSize);
        await sendBatch(batch);
      }
    },
  };
}

// ===================================================================
// Helpers
// ===================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
