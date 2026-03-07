#!/usr/bin/env node
// ---------------------------------------------------------------------------
// @uncaughtdev/core — MCP server for AI coding assistants
// ---------------------------------------------------------------------------

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { openStore, type SqliteStore } from './sqlite-store';
import { buildFixPrompt } from './prompt-builder';
import type { IssueStatus } from './types';

// ---------------------------------------------------------------------------
// Paths (same pattern as local-viewer.ts)
// ---------------------------------------------------------------------------

function getBaseDir(): string {
  return path.resolve(process.cwd(), '.uncaught');
}

function getDbPath(): string {
  return path.join(getBaseDir(), 'uncaught.db');
}

function withStore<T>(fn: (store: SqliteStore) => T): T {
  const store = openStore(getDbPath());
  store.importFromFiles(getBaseDir());
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'setup_uncaught',
    description:
      'Install and configure Uncaught error monitoring in the current project. ' +
      'Auto-detects your framework (React, Next.js, Vite, etc.), installs packages, ' +
      'and patches entry files. Run this first before any other tool.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_errors',
    description:
      'List all captured error issues. Returns fingerprint, title, error type, ' +
      'count, status, and timestamps. Use this to see what bugs exist.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'resolved', 'ignored'],
          description: 'Filter by status. Omit for all issues.',
        },
        environment: {
          type: 'string',
          description: 'Filter by deploy environment (e.g. "production", "staging").',
        },
      },
    },
  },
  {
    name: 'get_error',
    description:
      'Get full details of a specific error: stack trace, breadcrumbs (user actions ' +
      'leading to the error), environment info, request context, and user info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fingerprint: {
          type: 'string',
          description: 'Error fingerprint ID. Use list_errors to find fingerprints.',
        },
      },
      required: ['fingerprint'],
    },
  },
  {
    name: 'get_fix_prompt',
    description:
      'Get an AI-ready fix prompt for a specific error. Returns a structured ' +
      'diagnosis with error details, stack trace, breadcrumbs, environment, and ' +
      'what to investigate. Use this to understand and fix the bug.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fingerprint: {
          type: 'string',
          description: 'Error fingerprint ID.',
        },
      },
      required: ['fingerprint'],
    },
  },
  {
    name: 'get_stats',
    description:
      'Get error statistics: total issues, open, resolved, ignored, and total events.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'resolve_error',
    description:
      'Update an error\'s status. Use after fixing a bug to mark it resolved.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fingerprint: {
          type: 'string',
          description: 'Error fingerprint ID.',
        },
        status: {
          type: 'string',
          enum: ['resolved', 'ignored', 'open'],
          description: 'New status. Defaults to "resolved".',
        },
      },
      required: ['fingerprint'],
    },
  },
  {
    name: 'search_errors',
    description:
      'Search errors by message text. Returns issues whose title matches the query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in error messages.',
        },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function handleSetup(): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const baseDir = getBaseDir();

  // Check if already set up
  if (fs.existsSync(baseDir) && fs.existsSync(getDbPath())) {
    return {
      content: [{
        type: 'text',
        text: 'Uncaught is already set up in this project. The .uncaught/ directory and database exist.\n\nYou can use list_errors to check for captured errors.',
      }],
    };
  }

  try {
    const output = execSync('npx uncaughtdev init', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      content: [{
        type: 'text',
        text: `Uncaught has been set up successfully!\n\n${output}\n\nErrors will now be captured automatically. Use list_errors to check for captured errors.`,
      }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Setup failed: ${msg}` }],
      isError: true,
    };
  }
}

function handleListErrors(args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  if (!fs.existsSync(getDbPath())) {
    return {
      content: [{
        type: 'text',
        text: 'No error database found. Run setup_uncaught first to install error monitoring, or trigger some errors in your app.',
      }],
    };
  }

  const filter: { status?: IssueStatus; environment?: string } = {};
  if (args.status) filter.status = args.status as IssueStatus;
  if (args.environment) filter.environment = args.environment as string;

  const issues = withStore((store) => store.getIssues(filter));

  if (issues.length === 0) {
    const filterDesc = filter.status || filter.environment
      ? ` matching filters (status: ${filter.status ?? 'any'}, environment: ${filter.environment ?? 'any'})`
      : '';
    return {
      content: [{ type: 'text', text: `No errors found${filterDesc}. Your app is running clean!` }],
    };
  }

  const lines = issues.map((issue, i) => {
    const status = issue.status.toUpperCase().padEnd(8);
    const count = `x${issue.count}`.padEnd(5);
    const fp = issue.fingerprint.slice(0, 8);
    const title = issue.title.length > 80 ? issue.title.slice(0, 77) + '...' : issue.title;
    const env = issue.environment ? ` [${issue.environment}]` : '';
    const rel = issue.release ? ` (${issue.release})` : '';
    return `${i + 1}. [${status}] ${count} ${issue.errorType}: ${title}${env}${rel}\n   fingerprint: ${issue.fingerprint}\n   last seen: ${issue.lastSeen}`;
  });

  return {
    content: [{
      type: 'text',
      text: `Found ${issues.length} error(s):\n\n${lines.join('\n\n')}`,
    }],
  };
}

function handleGetError(args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const fingerprint = args.fingerprint as string;

  return withStore((store) => {
    const issue = store.getIssue(fingerprint);
    if (!issue) {
      return {
        content: [{ type: 'text', text: `No error found with fingerprint: ${fingerprint}` }],
        isError: true,
      };
    }

    const event = store.getLatestEvent(fingerprint);
    const parts: string[] = [];

    parts.push(`# ${issue.errorType}: ${issue.title}`);
    parts.push('');
    parts.push(`**Status:** ${issue.status} | **Count:** ${issue.count} | **Affected users:** ${issue.affectedUsers.length}`);
    parts.push(`**First seen:** ${issue.firstSeen} | **Last seen:** ${issue.lastSeen}`);
    if (issue.release) parts.push(`**Release:** ${issue.release}`);
    if (issue.environment) parts.push(`**Environment:** ${issue.environment}`);
    parts.push(`**Fingerprint:** ${issue.fingerprint}`);

    if (event) {
      // Stack trace
      const stack = event.error.resolvedStack || event.error.stack;
      if (stack) {
        parts.push('');
        parts.push('## Stack Trace');
        parts.push('```');
        parts.push(stack);
        parts.push('```');
      }

      // Component stack (React)
      if (event.error.componentStack) {
        parts.push('');
        parts.push('## Component Stack');
        parts.push('```');
        parts.push(event.error.componentStack);
        parts.push('```');
      }

      // Breadcrumbs
      if (event.breadcrumbs && event.breadcrumbs.length > 0) {
        parts.push('');
        parts.push('## Breadcrumbs (user actions before error)');
        for (const crumb of event.breadcrumbs.slice(-10)) {
          parts.push(`- [${crumb.timestamp}] ${crumb.type}/${crumb.category}: ${crumb.message}`);
        }
      }

      // Environment
      if (event.environment) {
        parts.push('');
        parts.push('## Environment');
        const env = event.environment;
        if (env.framework) parts.push(`- Framework: ${env.framework} ${env.frameworkVersion ?? ''}`);
        if (env.runtime) parts.push(`- Runtime: ${env.runtime} ${env.runtimeVersion ?? ''}`);
        if (env.browser) parts.push(`- Browser: ${env.browser} ${env.browserVersion ?? ''}`);
        if (env.os) parts.push(`- OS: ${env.os}`);
        if (env.url) parts.push(`- URL: ${env.url}`);
        if (env.deploy) parts.push(`- Deploy: ${env.deploy}`);
      }

      // Request context
      if (event.request) {
        parts.push('');
        parts.push('## Request');
        parts.push(`- ${event.request.method ?? 'GET'} ${event.request.url ?? 'unknown'}`);
      }

      // User feedback
      if (event.userFeedback) {
        parts.push('');
        parts.push('## User Feedback');
        parts.push(event.userFeedback);
      }
    }

    return {
      content: [{ type: 'text', text: parts.join('\n') }],
    };
  });
}

function handleGetFixPrompt(args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const fingerprint = args.fingerprint as string;

  return withStore((store) => {
    const event = store.getLatestEvent(fingerprint);
    if (!event) {
      return {
        content: [{ type: 'text', text: `No error found with fingerprint: ${fingerprint}` }],
        isError: true,
      };
    }

    // Use the stored fix prompt, or generate one
    const prompt = event.fixPrompt || buildFixPrompt(event);

    return {
      content: [{ type: 'text', text: prompt }],
    };
  });
}

function handleGetStats(): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  if (!fs.existsSync(getDbPath())) {
    return {
      content: [{
        type: 'text',
        text: 'No error database found. Run setup_uncaught first.',
      }],
    };
  }

  const stats = withStore((store) => store.getStats());

  return {
    content: [{
      type: 'text',
      text: [
        `Error Statistics:`,
        `  Total issues:  ${stats.total}`,
        `  Open:          ${stats.open}`,
        `  Resolved:      ${stats.resolved}`,
        `  Ignored:       ${stats.ignored}`,
        `  Total events:  ${stats.totalEvents}`,
      ].join('\n'),
    }],
  };
}

function handleResolveError(args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const fingerprint = args.fingerprint as string;
  const status = (args.status as IssueStatus) ?? 'resolved';

  return withStore((store) => {
    const issue = store.getIssue(fingerprint);
    if (!issue) {
      return {
        content: [{ type: 'text', text: `No error found with fingerprint: ${fingerprint}` }],
        isError: true,
      };
    }

    store.updateIssueStatus(fingerprint, status);

    return {
      content: [{
        type: 'text',
        text: `Marked "${issue.title}" as ${status}.`,
      }],
    };
  });
}

function handleSearchErrors(args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const query = (args.query as string).toLowerCase();

  if (!fs.existsSync(getDbPath())) {
    return {
      content: [{ type: 'text', text: 'No error database found. Run setup_uncaught first.' }],
    };
  }

  const allIssues = withStore((store) => store.getIssues());
  const matches = allIssues.filter(
    (issue) =>
      issue.title.toLowerCase().includes(query) ||
      issue.errorType.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    return {
      content: [{ type: 'text', text: `No errors matching "${args.query}".` }],
    };
  }

  const lines = matches.map((issue, i) => {
    const status = issue.status.toUpperCase().padEnd(8);
    const title = issue.title.length > 80 ? issue.title.slice(0, 77) + '...' : issue.title;
    return `${i + 1}. [${status}] ${issue.errorType}: ${title}\n   fingerprint: ${issue.fingerprint}`;
  });

  return {
    content: [{
      type: 'text',
      text: `Found ${matches.length} error(s) matching "${args.query}":\n\n${lines.join('\n\n')}`,
    }],
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const server = new Server(
    { name: 'uncaught-mcp', version: '0.2.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'setup_uncaught':
          return handleSetup();
        case 'list_errors':
          return handleListErrors(args ?? {});
        case 'get_error':
          return handleGetError(args ?? {});
        case 'get_fix_prompt':
          return handleGetFixPrompt(args ?? {});
        case 'get_stats':
          return handleGetStats();
        case 'resolve_error':
          return handleResolveError(args ?? {});
        case 'search_errors':
          return handleSearchErrors(args ?? {});
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Uncaught MCP server failed to start:', error);
  process.exit(1);
});
