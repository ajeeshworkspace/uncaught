// ---------------------------------------------------------------------------
// @uncaughtdev/core — fix-prompt builder
// ---------------------------------------------------------------------------

import type { UncaughtEvent, Breadcrumb, EnvironmentInfo, OperationInfo, RequestInfo } from './types';

/**
 * Build a structured Markdown prompt that can be pasted into an AI assistant
 * to diagnose and fix the production error described by `event`.
 *
 * Empty sections are omitted to keep the prompt concise.
 */
export function buildFixPrompt(event: Partial<UncaughtEvent>): string {
  const sections: string[] = [];

  // ----- Intro -------------------------------------------------------------
  sections.push(
    'I have a production bug in my application that I need help diagnosing and fixing.\n'
  );

  // ----- Error -------------------------------------------------------------
  if (event.error) {
    const location = extractLocation(event.error.stack);
    const lines: string[] = ['## Error', ''];
    lines.push(`- **Type:** ${event.error.type || 'Error'}`);
    lines.push(`- **Message:** ${event.error.message || '(no message)'}`);
    if (location) {
      lines.push(`- **Location:** ${location}`);
    }
    sections.push(lines.join('\n'));
  }

  // ----- Stack Trace -------------------------------------------------------
  const stackSource = event.error?.resolvedStack ?? event.error?.stack;
  if (stackSource) {
    const frames = stackSource
      .split('\n')
      .slice(0, 15)
      .map((l) => l.trimEnd())
      .join('\n');
    const label = event.error?.resolvedStack ? 'Stack Trace (source-mapped)' : 'Stack Trace';
    sections.push(`## ${label}\n\n\`\`\`\n${frames}\n\`\`\``);
  }

  // ----- Failed Operation --------------------------------------------------
  if (event.operation) {
    sections.push(formatOperation(event.operation));
  }

  // ----- HTTP Request Context ----------------------------------------------
  if (event.request) {
    sections.push(formatRequest(event.request));
  }

  // ----- User Session (last 5 breadcrumbs) ---------------------------------
  if (event.breadcrumbs && event.breadcrumbs.length > 0) {
    sections.push(formatBreadcrumbs(event.breadcrumbs));
  }

  // ----- Environment -------------------------------------------------------
  if (event.environment) {
    sections.push(formatEnvironment(event.environment));
  }

  // ----- React Component Stack ---------------------------------------------
  if (event.error?.componentStack) {
    sections.push(
      `## React Component Stack\n\n\`\`\`\n${event.error.componentStack.trim()}\n\`\`\``
    );
  }

  // ----- What I need -------------------------------------------------------
  sections.push(
    [
      '## What I need',
      '',
      '1. **Root cause analysis** — explain why this error is occurring.',
      '2. **A fix** — provide the corrected code with an explanation of the changes.',
      '3. **Prevention** — suggest any guards or tests to prevent this from happening again.',
    ].join('\n')
  );

  return sections.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the top-most location (file:line:col) from a stack trace string.
 */
function extractLocation(stack?: string): string | undefined {
  if (!stack) return undefined;

  for (const line of stack.split('\n')) {
    const trimmed = line.trim();

    // V8: "    at fn (file:line:col)"
    const v8 = trimmed.match(/at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?/);
    if (v8) return v8[1];

    // SpiderMonkey / JSC: "fn@file:line:col"
    const sm = trimmed.match(/@(.+?:\d+:\d+)/);
    if (sm) return sm[1];
  }

  return undefined;
}

function formatOperation(op: OperationInfo): string {
  const lines: string[] = ['## Failed Operation', ''];
  lines.push(`- **Provider:** ${op.provider}`);
  lines.push(`- **Type:** ${op.type}`);
  lines.push(`- **Method:** ${op.method}`);
  if (op.params) {
    lines.push(`- **Params:**`);
    lines.push('```json');
    lines.push(JSON.stringify(op.params, null, 2));
    lines.push('```');
  }
  if (op.errorCode) {
    lines.push(`- **Error Code:** ${op.errorCode}`);
  }
  if (op.errorDetails) {
    lines.push(`- **Error Details:** ${op.errorDetails}`);
  }
  return lines.join('\n');
}

function formatRequest(req: RequestInfo): string {
  const lines: string[] = ['## HTTP Request Context', ''];
  if (req.method) lines.push(`- **Method:** ${req.method}`);
  if (req.url) lines.push(`- **URL:** ${req.url}`);
  if (req.body) {
    lines.push(`- **Body:**`);
    lines.push('```json');
    lines.push(
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body, null, 2)
    );
    lines.push('```');
  }
  return lines.join('\n');
}

function formatBreadcrumbs(crumbs: Breadcrumb[]): string {
  // Take the last 5 breadcrumbs
  const recent = crumbs.slice(-5);
  const lines: string[] = ['## User Session', ''];

  for (const crumb of recent) {
    const time = formatTime(crumb.timestamp);
    lines.push(`- \`${time}\` **[${crumb.type}]** ${crumb.message}`);
  }

  return lines.join('\n');
}

/**
 * Extract HH:MM:SS from an ISO timestamp.
 */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  } catch {
    return iso;
  }
}

function formatEnvironment(env: EnvironmentInfo): string {
  const lines: string[] = ['## Environment', ''];
  const entries: Array<[string, string | undefined]> = [
    ['Deploy Environment', env.deploy],
    ['Framework', env.framework],
    ['Framework Version', env.frameworkVersion],
    ['Runtime', env.runtime],
    ['Runtime Version', env.runtimeVersion],
    ['Platform', env.platform],
    ['Browser', env.browser ? `${env.browser} ${env.browserVersion ?? ''}`.trim() : undefined],
    ['OS', env.os],
    ['Device', env.deviceType],
    ['Locale', env.locale],
    ['Timezone', env.timezone],
    ['URL', env.url],
  ];

  for (const [label, value] of entries) {
    if (value) {
      lines.push(`- **${label}:** ${value}`);
    }
  }

  return lines.join('\n');
}
