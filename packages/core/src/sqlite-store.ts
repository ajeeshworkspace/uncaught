// ---------------------------------------------------------------------------
// @uncaughtdev/core — SQLite storage layer
// ---------------------------------------------------------------------------

import Database from 'better-sqlite3';
import type { IssueEntry, IssueStatus, UncaughtEvent } from './types';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS issues (
  fingerprint       TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  error_type        TEXT NOT NULL,
  count             INTEGER NOT NULL DEFAULT 1,
  affected_users    TEXT NOT NULL DEFAULT '[]',
  first_seen        TEXT NOT NULL,
  last_seen         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  fix_prompt_file   TEXT NOT NULL DEFAULT '',
  latest_event_file TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_last_seen ON issues(last_seen);

CREATE TABLE IF NOT EXISTS events (
  event_id    TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  timestamp   TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'error',
  fix_prompt  TEXT NOT NULL DEFAULT '',
  payload     TEXT NOT NULL,
  FOREIGN KEY (fingerprint) REFERENCES issues(fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SqliteStore {
  upsertIssue(entry: IssueEntry): void;
  getIssues(filter?: { status?: IssueStatus }): IssueEntry[];
  getIssue(fingerprint: string): IssueEntry | undefined;
  updateIssueStatus(fingerprint: string, status: IssueStatus): void;
  deleteAllIssues(): void;

  insertEvent(event: UncaughtEvent): void;
  getEvents(fingerprint: string, opts?: { limit?: number; offset?: number }): UncaughtEvent[];
  getLatestEvent(fingerprint: string): UncaughtEvent | undefined;
  getEventCount(fingerprint: string): number;

  getStats(): { total: number; open: number; resolved: number; ignored: number; totalEvents: number };

  importFromFiles(baseDir: string): { issues: number; events: number };

  close(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function openStore(dbPath: string): SqliteStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  // Prepared statements
  const stmtUpsertIssue = db.prepare(`
    INSERT INTO issues (fingerprint, title, error_type, count, affected_users, first_seen, last_seen, status, fix_prompt_file, latest_event_file)
    VALUES (@fingerprint, @title, @error_type, @count, @affected_users, @first_seen, @last_seen, @status, @fix_prompt_file, @latest_event_file)
    ON CONFLICT(fingerprint) DO UPDATE SET
      title = @title,
      error_type = @error_type,
      count = @count,
      affected_users = @affected_users,
      first_seen = @first_seen,
      last_seen = @last_seen,
      status = @status,
      fix_prompt_file = @fix_prompt_file,
      latest_event_file = @latest_event_file
  `);

  const stmtGetIssues = db.prepare('SELECT * FROM issues ORDER BY last_seen DESC');
  const stmtGetIssuesByStatus = db.prepare('SELECT * FROM issues WHERE status = ? ORDER BY last_seen DESC');
  const stmtGetIssue = db.prepare('SELECT * FROM issues WHERE fingerprint = ?');
  const stmtUpdateStatus = db.prepare('UPDATE issues SET status = ? WHERE fingerprint = ?');
  const stmtDeleteAllIssues = db.prepare('DELETE FROM issues');
  const stmtDeleteAllEvents = db.prepare('DELETE FROM events');

  const stmtInsertEvent = db.prepare(`
    INSERT OR IGNORE INTO events (event_id, fingerprint, timestamp, level, fix_prompt, payload)
    VALUES (@event_id, @fingerprint, @timestamp, @level, @fix_prompt, @payload)
  `);

  const stmtGetEvents = db.prepare('SELECT * FROM events WHERE fingerprint = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?');
  const stmtGetLatestEvent = db.prepare('SELECT * FROM events WHERE fingerprint = ? ORDER BY timestamp DESC LIMIT 1');
  const stmtGetEventCount = db.prepare('SELECT COUNT(*) as cnt FROM events WHERE fingerprint = ?');

  const stmtGetMeta = db.prepare('SELECT value FROM _meta WHERE key = ?');
  const stmtSetMeta = db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)');

  const stmtCountAll = db.prepare('SELECT COUNT(*) as cnt FROM issues');
  const stmtCountByStatus = db.prepare('SELECT COUNT(*) as cnt FROM issues WHERE status = ?');
  const stmtCountEvents = db.prepare('SELECT COUNT(*) as cnt FROM events');

  // Row → IssueEntry mapper
  function rowToIssue(row: Record<string, unknown>): IssueEntry {
    return {
      fingerprint: row.fingerprint as string,
      title: row.title as string,
      errorType: row.error_type as string,
      count: row.count as number,
      affectedUsers: JSON.parse(row.affected_users as string),
      firstSeen: row.first_seen as string,
      lastSeen: row.last_seen as string,
      status: row.status as IssueStatus,
      fixPromptFile: row.fix_prompt_file as string,
      latestEventFile: row.latest_event_file as string,
    };
  }

  // IssueEntry → row params mapper
  function issueToParams(entry: IssueEntry) {
    return {
      fingerprint: entry.fingerprint,
      title: entry.title,
      error_type: entry.errorType,
      count: entry.count,
      affected_users: JSON.stringify(entry.affectedUsers),
      first_seen: entry.firstSeen,
      last_seen: entry.lastSeen,
      status: entry.status,
      fix_prompt_file: entry.fixPromptFile,
      latest_event_file: entry.latestEventFile,
    };
  }

  // Row → UncaughtEvent mapper
  function rowToEvent(row: Record<string, unknown>): UncaughtEvent {
    return JSON.parse(row.payload as string) as UncaughtEvent;
  }

  // Insert event + upsert issue atomically
  const insertEventAndUpsert = db.transaction((event: UncaughtEvent, eventFile: string, promptFile: string) => {
    const fp = event.fingerprint;
    const userId = event.user?.id ?? event.user?.email ?? 'anonymous';

    // Insert event row
    stmtInsertEvent.run({
      event_id: event.eventId,
      fingerprint: fp,
      timestamp: event.timestamp,
      level: event.level,
      fix_prompt: event.fixPrompt ?? '',
      payload: JSON.stringify(event),
    });

    // Upsert issue
    const existingRow = stmtGetIssue.get(fp) as Record<string, unknown> | undefined;
    if (existingRow) {
      const existing = rowToIssue(existingRow);
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
      stmtUpsertIssue.run(issueToParams(existing));
    } else {
      stmtUpsertIssue.run(issueToParams({
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
      }));
    }
  });

  return {
    upsertIssue(entry: IssueEntry): void {
      stmtUpsertIssue.run(issueToParams(entry));
    },

    getIssues(filter?: { status?: IssueStatus }): IssueEntry[] {
      const rows = filter?.status
        ? stmtGetIssuesByStatus.all(filter.status)
        : stmtGetIssues.all();
      return (rows as Record<string, unknown>[]).map(rowToIssue);
    },

    getIssue(fingerprint: string): IssueEntry | undefined {
      const row = stmtGetIssue.get(fingerprint) as Record<string, unknown> | undefined;
      return row ? rowToIssue(row) : undefined;
    },

    updateIssueStatus(fingerprint: string, status: IssueStatus): void {
      stmtUpdateStatus.run(status, fingerprint);
    },

    deleteAllIssues(): void {
      stmtDeleteAllEvents.run();
      stmtDeleteAllIssues.run();
    },

    insertEvent(event: UncaughtEvent): void {
      const ts = (event.timestamp ?? new Date().toISOString()).replace(/[:.]/g, '-');
      const eventFile = `event-${ts}.json`;
      const promptFile = `${event.fingerprint}.md`;
      insertEventAndUpsert(event, eventFile, promptFile);
    },

    getEvents(fingerprint: string, opts?: { limit?: number; offset?: number }): UncaughtEvent[] {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;
      const rows = stmtGetEvents.all(fingerprint, limit, offset);
      return (rows as Record<string, unknown>[]).map(rowToEvent);
    },

    getLatestEvent(fingerprint: string): UncaughtEvent | undefined {
      const row = stmtGetLatestEvent.get(fingerprint) as Record<string, unknown> | undefined;
      return row ? rowToEvent(row) : undefined;
    },

    getEventCount(fingerprint: string): number {
      const row = stmtGetEventCount.get(fingerprint) as { cnt: number };
      return row.cnt;
    },

    getStats() {
      return {
        total: (stmtCountAll.get() as { cnt: number }).cnt,
        open: (stmtCountByStatus.get('open') as { cnt: number }).cnt,
        resolved: (stmtCountByStatus.get('resolved') as { cnt: number }).cnt,
        ignored: (stmtCountByStatus.get('ignored') as { cnt: number }).cnt,
        totalEvents: (stmtCountEvents.get() as { cnt: number }).cnt,
      };
    },

    importFromFiles(baseDir: string): { issues: number; events: number } {
      const meta = stmtGetMeta.get('migrated') as { value: string } | undefined;
      if (meta?.value === 'true') return { issues: 0, events: 0 };

      let issueCount = 0;
      let eventCount = 0;

      try {
        const fsSync = require('fs');
        const pathMod = require('path');

        // Import issues.json
        const issuesPath = pathMod.join(baseDir, 'issues.json');
        if (fsSync.existsSync(issuesPath)) {
          const raw = fsSync.readFileSync(issuesPath, 'utf-8');
          const issues = JSON.parse(raw) as IssueEntry[];
          for (const issue of issues) {
            stmtUpsertIssue.run(issueToParams(issue));
            issueCount++;
          }
        }

        // Import event files
        const eventsDir = pathMod.join(baseDir, 'events');
        if (fsSync.existsSync(eventsDir)) {
          const fps = fsSync.readdirSync(eventsDir);
          for (const fp of fps) {
            const fpDir = pathMod.join(eventsDir, fp);
            if (!fsSync.statSync(fpDir).isDirectory()) continue;

            const files = fsSync.readdirSync(fpDir).filter((f: string) => f.startsWith('event-') && f.endsWith('.json'));
            for (const file of files) {
              try {
                const eventRaw = fsSync.readFileSync(pathMod.join(fpDir, file), 'utf-8');
                const event = JSON.parse(eventRaw) as UncaughtEvent;
                stmtInsertEvent.run({
                  event_id: event.eventId,
                  fingerprint: event.fingerprint,
                  timestamp: event.timestamp,
                  level: event.level,
                  fix_prompt: event.fixPrompt ?? '',
                  payload: eventRaw,
                });
                eventCount++;
              } catch {
                // Skip malformed event files
              }
            }
          }
        }
      } catch {
        // Migration is best-effort
      }

      stmtSetMeta.run('migrated', 'true');
      return { issues: issueCount, events: eventCount };
    },

    close(): void {
      db.close();
    },
  };
}
