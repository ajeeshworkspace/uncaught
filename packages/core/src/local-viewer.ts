#!/usr/bin/env node
// ---------------------------------------------------------------------------
// @uncaughtdev/core — local viewer CLI  (`npx uncaught` / `uncaught`)
// ---------------------------------------------------------------------------

import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import { spawn } from 'child_process';
import type { IssueEntry, IssueStatus, UncaughtEvent } from './types';
import { openStore, type SqliteStore } from './sqlite-store';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';
const BG_RED = '\x1b[41m';
const BG_GREEN = '\x1b[42m';
const BG_YELLOW = '\x1b[43m';

function c(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getBaseDir(): string {
  return path.resolve(process.cwd(), '.uncaught');
}

function getIssuesPath(): string {
  return path.join(getBaseDir(), 'issues.json');
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

function getDbPath(): string {
  return path.join(getBaseDir(), 'uncaught.db');
}

function getStore(): SqliteStore {
  const store = openStore(getDbPath());
  // Auto-migrate from flat files on first access
  store.importFromFiles(getBaseDir());
  return store;
}

async function loadIssues(): Promise<IssueEntry[]> {
  try {
    const store = getStore();
    const issues = store.getIssues();
    store.close();
    return issues;
  } catch {
    // Fallback to flat file
    try {
      const raw = await fs.readFile(getIssuesPath(), 'utf-8');
      return JSON.parse(raw) as IssueEntry[];
    } catch {
      return [];
    }
  }
}

async function saveIssues(issues: IssueEntry[]): Promise<void> {
  // Write to flat file for backward compat
  const indexPath = getIssuesPath();
  const tmpPath = indexPath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(issues, null, 2), 'utf-8');
  await fs.rename(tmpPath, indexPath);

  // Also update SQLite
  try {
    const store = getStore();
    for (const issue of issues) {
      store.upsertIssue(issue);
    }
    store.close();
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdList(): Promise<void> {
  const issues = await loadIssues();

  if (issues.length === 0) {
    console.log(c(DIM, '\n  No issues found in .uncaught/\n'));
    console.log(c(GRAY, '  Capture errors with initUncaught() to see them here.\n'));
    return;
  }

  console.log('');
  console.log(c(BOLD, '  Uncaught Issues'));
  console.log(c(DIM, '  ─'.repeat(35)));
  console.log('');

  // Header
  const header = formatRow('#', 'Status', 'Count', 'Error', 'Last Seen');
  console.log(c(DIM, `  ${header}`));
  console.log(c(DIM, '  ' + '─'.repeat(90)));

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const num = String(i + 1).padStart(3);
    const status = formatStatus(issue.status);
    const count = String(issue.count).padStart(5);
    const title = truncate(issue.title, 45);
    const type = truncate(issue.errorType, 15);
    const lastSeen = formatRelativeTime(issue.lastSeen);

    const errorCol = `${c(RED, type)} ${c(WHITE, title)}`;

    console.log(
      `  ${c(CYAN, num)}  ${status}  ${c(YELLOW, count)}  ${errorCol}  ${c(GRAY, lastSeen)}`
    );
  }

  console.log('');
  console.log(c(DIM, `  ${issues.length} issue(s) total`));
  console.log(
    c(GRAY, '  Run: uncaught show <n> to view fix prompt, --open to open in editor')
  );
  console.log(
    c(CYAN, '  Run: npx @uncaughtdev/core dashboard — for a web UI')
  );
  console.log('');
}

async function cmdShow(indexStr: string, openInEditor: boolean): Promise<void> {
  const issues = await loadIssues();
  const idx = parseInt(indexStr, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= issues.length) {
    console.error(c(RED, `\n  Invalid issue number: ${indexStr}`));
    console.error(c(GRAY, `  Valid range: 1-${issues.length}\n`));
    process.exitCode = 1;
    return;
  }

  const issue = issues[idx];
  const promptPath = path.join(getBaseDir(), 'fix-prompts', issue.fixPromptFile);

  let content: string;
  try {
    content = await fs.readFile(promptPath, 'utf-8');
  } catch {
    console.error(c(RED, `\n  Fix prompt file not found: ${promptPath}\n`));
    process.exitCode = 1;
    return;
  }

  if (openInEditor) {
    const editor = process.env.EDITOR || 'code';
    console.log(c(DIM, `  Opening ${promptPath} in ${editor}...`));

    try {
      const child = spawn(editor, [promptPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {
      // Fallback: try to just open with `open` (macOS) or `xdg-open` (Linux)
      const fallback = process.platform === 'darwin' ? 'open' : 'xdg-open';
      try {
        const child = spawn(fallback, [promptPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } catch {
        console.error(c(RED, `  Could not open editor. File is at: ${promptPath}`));
      }
    }
    return;
  }

  // Print to stdout
  console.log('');
  console.log(c(BOLD, `  Fix Prompt for Issue #${idx + 1}`));
  console.log(c(DIM, `  Fingerprint: ${issue.fingerprint}`));
  console.log(c(DIM, `  Count: ${issue.count} | Users: ${issue.affectedUsers.length}`));
  console.log(c(DIM, '  ─'.repeat(35)));
  console.log('');
  console.log(content);
  console.log('');
  console.log(c(GRAY, `  File: ${promptPath}`));
  console.log(c(GRAY, '  Tip: run with --open to open in your editor'));
  console.log('');
}

async function cmdClear(): Promise<void> {
  const baseDir = getBaseDir();

  try {
    await fs.access(baseDir);
  } catch {
    console.log(c(DIM, '\n  Nothing to clear — .uncaught/ does not exist.\n'));
    return;
  }

  // Clear SQLite
  try {
    const store = getStore();
    store.deleteAllIssues();
    store.close();
  } catch {
    // Best-effort
  }

  // Remove contents but keep the directory
  const entries = await fs.readdir(baseDir);

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  console.log(c(GREEN, '\n  Cleared all issues in .uncaught/\n'));
}

async function cmdResolve(indexStr: string): Promise<void> {
  const issues = await loadIssues();
  const idx = parseInt(indexStr, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= issues.length) {
    console.error(c(RED, `\n  Invalid issue number: ${indexStr}`));
    console.error(c(GRAY, `  Valid range: 1-${issues.length}\n`));
    process.exitCode = 1;
    return;
  }

  const issue = issues[idx];

  if (issue.status === 'resolved') {
    console.log(c(YELLOW, `\n  Issue #${idx + 1} is already resolved.\n`));
    return;
  }

  issue.status = 'resolved' as IssueStatus;
  await saveIssues(issues);

  // Also update SQLite directly
  try {
    const store = getStore();
    store.updateIssueStatus(issue.fingerprint, 'resolved');
    store.close();
  } catch {
    // Best-effort
  }

  console.log(c(GREEN, `\n  Issue #${idx + 1} marked as resolved.`));
  console.log(c(DIM, `  ${issue.errorType}: ${truncate(issue.title, 60)}\n`));
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRow(
  num: string,
  status: string,
  count: string,
  error: string,
  lastSeen: string
): string {
  return `${num.padStart(3)}  ${status.padEnd(10)}  ${count.padStart(5)}  ${error.padEnd(60)}  ${lastSeen}`;
}

function formatStatus(status: IssueStatus): string {
  switch (status) {
    case 'open':
      return c(`${BG_RED}${WHITE}${BOLD}`, ' OPEN ');
    case 'resolved':
      return c(`${BG_GREEN}${WHITE}${BOLD}`, ' DONE ');
    case 'ignored':
      return c(`${BG_YELLOW}${WHITE}${BOLD}`, ' SKIP ');
    default:
      return c(DIM, String(status).padEnd(6));
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;

    if (diffMs < 0) return 'just now';

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
${c(BOLD, '  uncaught')} — error monitoring for vibe coders

${c(BOLD, '  Setup:')}
    ${c(CYAN, 'npx uncaughtdev init')}         Auto-detect framework, install, and patch — one command

${c(BOLD, '  Viewer:')}
    npx uncaughtdev           List all captured issues
    npx uncaughtdev list      List all captured issues
    npx uncaughtdev show <n>  Display fix prompt for issue #n
    npx uncaughtdev show <n> --open  Open fix prompt in $EDITOR
    npx uncaughtdev resolve <n>      Mark issue #n as resolved
    npx uncaughtdev clear     Remove all captured issues
    npx uncaughtdev dashboard        Open web dashboard (--port 3300)

${c(BOLD, '  Examples:')}
    npx uncaughtdev init      Setup Uncaught in your project
    npx uncaughtdev show 1    Print fix prompt for issue #1
    npx uncaughtdev show 3 --open  Open issue #3's prompt in editor
`);
}

// ---------------------------------------------------------------------------
// Init command — auto-detect, install, and wire up everything
// ---------------------------------------------------------------------------

interface FrameworkDetection {
  framework: 'nextjs-app' | 'nextjs-pages' | 'vite-react' | 'cra' | 'unknown';
  packageManager: 'pnpm' | 'yarn' | 'bun' | 'npm';
  hasSupabase: boolean;
  hasTypescript: boolean;
  rootDir: string;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function dirExists(p: string): Promise<boolean> {
  try { const s = await fs.stat(p); return s.isDirectory(); } catch { return false; }
}

function exec(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function detectFramework(): Promise<FrameworkDetection> {
  const cwd = process.cwd();
  const result: FrameworkDetection = {
    framework: 'unknown',
    packageManager: 'npm',
    hasSupabase: false,
    hasTypescript: false,
    rootDir: cwd,
  };

  if (await fileExists(path.join(cwd, 'pnpm-lock.yaml'))) result.packageManager = 'pnpm';
  else if (await fileExists(path.join(cwd, 'yarn.lock'))) result.packageManager = 'yarn';
  else if (await fileExists(path.join(cwd, 'bun.lockb')) || await fileExists(path.join(cwd, 'bun.lock'))) result.packageManager = 'bun';

  let pkg: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8');
    pkg = JSON.parse(raw);
  } catch {
    return result;
  }

  const allDeps = {
    ...(pkg.dependencies as Record<string, string> ?? {}),
    ...(pkg.devDependencies as Record<string, string> ?? {}),
  };

  result.hasTypescript = 'typescript' in allDeps || await fileExists(path.join(cwd, 'tsconfig.json'));
  result.hasSupabase = '@supabase/supabase-js' in allDeps;

  if ('next' in allDeps) {
    if (await dirExists(path.join(cwd, 'app')) || await dirExists(path.join(cwd, 'src', 'app'))) {
      result.framework = 'nextjs-app';
    } else if (await dirExists(path.join(cwd, 'pages')) || await dirExists(path.join(cwd, 'src', 'pages'))) {
      result.framework = 'nextjs-pages';
    } else {
      result.framework = 'nextjs-app';
    }
  } else if ('vite' in allDeps && ('react' in allDeps || 'react-dom' in allDeps)) {
    result.framework = 'vite-react';
  } else if ('react-scripts' in allDeps) {
    result.framework = 'cra';
  }

  return result;
}

function installArgs(pm: string, pkgs: string[]): { cmd: string; args: string[] } {
  switch (pm) {
    case 'pnpm': return { cmd: 'pnpm', args: ['add', ...pkgs] };
    case 'yarn': return { cmd: 'yarn', args: ['add', ...pkgs] };
    case 'bun': return { cmd: 'bun', args: ['add', ...pkgs] };
    default: return { cmd: 'npm', args: ['install', ...pkgs] };
  }
}

function findLastImport(content: string): number {
  let last = -1;
  const re = /^import\s/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) last = m.index;
  return last;
}

function insertImport(content: string, importLine: string): string {
  const lastIdx = findLastImport(content);
  if (lastIdx >= 0) {
    const insertPos = content.indexOf('\n', lastIdx) + 1;
    return content.slice(0, insertPos) + importLine + content.slice(insertPos);
  }
  // No imports — add after 'use client' if present, else at top
  const firstNL = content.indexOf('\n');
  if (firstNL >= 0 && content.slice(0, firstNL).includes('use client')) {
    return content.slice(0, firstNL + 1) + '\n' + importLine + content.slice(firstNL + 1);
  }
  return importLine + content;
}

async function cmdInit(): Promise<void> {
  const cwd = process.cwd();

  console.log('');
  console.log(c(BOLD, '  🧪 uncaught init'));
  console.log(c(DIM, '  ─'.repeat(35)));
  console.log('');

  // 1. Detect
  console.log(c(CYAN, '  ▸ Detecting framework...'));
  const det = await detectFramework();

  const names: Record<string, string> = {
    'nextjs-app': 'Next.js (App Router)',
    'nextjs-pages': 'Next.js (Pages Router)',
    'vite-react': 'Vite + React',
    'cra': 'Create React App',
    'unknown': 'Unknown',
  };

  console.log(`    ${c(GREEN, names[det.framework])} · ${det.packageManager} · TS=${det.hasTypescript} · Supabase=${det.hasSupabase}`);
  console.log('');

  if (det.framework === 'unknown') {
    console.log(c(YELLOW, '  ⚠ Could not detect framework. Supported: Next.js, Vite+React, CRA'));
    process.exitCode = 1;
    return;
  }

  // 2. Install
  console.log(c(CYAN, '  ▸ Installing packages...'));
  const pkgs = ['@uncaughtdev/core', '@uncaughtdev/react'];
  if (det.hasSupabase) pkgs.push('@uncaughtdev/supabase');
  const inst = installArgs(det.packageManager, pkgs);
  console.log(c(GRAY, `    ${inst.cmd} ${inst.args.join(' ')}`));

  const ok = await exec(inst.cmd, inst.args);
  if (!ok) {
    console.log(c(YELLOW, '\n  ⚠ Install failed — packages may not be published yet.'));
    console.log(c(GRAY, '    Continuing with file patching. Install manually if needed.'));
    console.log('');
  } else {
    console.log(c(GREEN, '  ✓ Packages installed'));
    console.log('');
  }

  // 3. Patch
  const ext = det.hasTypescript ? 'tsx' : 'jsx';
  const tsExt = det.hasTypescript ? 'ts' : 'js';
  const projectKey = path.basename(cwd);

  if (det.framework === 'nextjs-app') {
    const appDir = await dirExists(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'src', 'app');

    // Providers file + Layout
    console.log(c(CYAN, '  ▸ Setting up providers...'));
    const layoutPath = path.join(appDir, `layout.${ext}`);
    await patchLayoutWithProviders(appDir, layoutPath, projectKey, ext);

    // API route
    console.log(c(CYAN, '  ▸ Creating API route...'));
    const routeDir = path.join(appDir, 'api', 'uncaught', 'local');
    await fs.mkdir(routeDir, { recursive: true });
    const routePath = path.join(routeDir, `route.${tsExt}`);
    if (!await fileExists(routePath)) {
      await fs.writeFile(routePath, `export { POST } from '@uncaughtdev/core/local-api-handler';\n`);
      console.log(c(GREEN, `  ✓ Created ${path.relative(cwd, routePath)}`));
    } else {
      console.log(c(YELLOW, `  ⊘ Already exists, skipping`));
    }

    // next.config
    console.log(c(CYAN, '  ▸ Patching next.config...'));
    await patchNextConfig(cwd);

  } else if (det.framework === 'nextjs-pages') {
    const pagesDir = await dirExists(path.join(cwd, 'pages')) ? path.join(cwd, 'pages') : path.join(cwd, 'src', 'pages');

    // _app
    console.log(c(CYAN, '  ▸ Patching _app...'));
    const appPath = path.join(pagesDir, `_app.${ext}`);
    await patchFileWithProvider(appPath, projectKey, 'pages-app');

    // API route
    console.log(c(CYAN, '  ▸ Creating API route...'));
    const routeDir = path.join(pagesDir, 'api', 'uncaught');
    await fs.mkdir(routeDir, { recursive: true });
    const routePath = path.join(routeDir, `local.${tsExt}`);
    if (!await fileExists(routePath)) {
      await fs.writeFile(routePath, `export { default } from '@uncaughtdev/core/local-api-handler/pages';\n`);
      console.log(c(GREEN, `  ✓ Created ${path.relative(cwd, routePath)}`));
    } else {
      console.log(c(YELLOW, `  ⊘ Already exists, skipping`));
    }

    // next.config
    console.log(c(CYAN, '  ▸ Patching next.config...'));
    await patchNextConfig(cwd);

  } else if (det.framework === 'vite-react' || det.framework === 'cra') {
    const candidates = det.framework === 'vite-react'
      ? ['src/main.tsx', 'src/main.jsx', 'main.tsx', 'main.jsx']
      : ['src/index.tsx', 'src/index.jsx'];
    let entryPath: string | null = null;
    for (const f of candidates) {
      const p = path.join(cwd, f);
      if (await fileExists(p)) { entryPath = p; break; }
    }

    if (entryPath) {
      console.log(c(CYAN, '  ▸ Patching entry file...'));
      await patchFileWithProvider(entryPath, projectKey, 'entry');
    } else {
      console.log(c(YELLOW, '  ⚠ Could not find entry file. Wrap your root with <UncaughtProvider> manually.'));
    }
  }

  // Supabase hint
  if (det.hasSupabase) {
    console.log('');
    console.log(c(CYAN, '  ▸ Supabase detected! Wrap your client:'));
    console.log(c(GRAY, "    import { wrapSupabase } from '@uncaughtdev/supabase';"));
    console.log(c(GRAY, '    const supabase = wrapSupabase(createClient(url, key));'));
  }

  // Done
  console.log('');
  console.log(c(GREEN, '  ✓ Done! Uncaught is now tracking errors.'));
  console.log('');
  console.log(c(WHITE, '    Start your dev server, trigger an error, then:'));
  console.log(c(CYAN, `    npx uncaughtdev`));
  console.log('');
}

// ---------------------------------------------------------------------------
// File patching
// ---------------------------------------------------------------------------

// Next.js App Router: create providers.tsx + patch layout to import it
async function patchLayoutWithProviders(appDir: string, layoutPath: string, projectKey: string, ext: string): Promise<void> {
  const cwd = process.cwd();
  const providersPath = path.join(appDir, `providers.${ext}`);
  const providersRel = path.relative(cwd, providersPath);
  const layoutRel = path.relative(cwd, layoutPath);

  // 1. Create providers.tsx (client component)
  if (await fileExists(providersPath)) {
    const existing = await fs.readFile(providersPath, 'utf-8');
    if (existing.includes('UncaughtProvider') || existing.includes('@uncaughtdev/react')) {
      console.log(c(YELLOW, `  ⊘ ${providersRel} already has UncaughtProvider, skipping`));
    } else {
      // Append UncaughtProvider to existing providers file
      let patched = existing;
      if (!patched.includes("'use client'") && !patched.includes('"use client"')) {
        patched = `'use client';\n\n${patched}`;
      }
      patched = insertImport(patched, `import { UncaughtProvider } from '@uncaughtdev/react';\n`);
      await fs.writeFile(providersPath, patched);
      console.log(c(YELLOW, `  ⚠ ${providersRel} exists — added import but you may need to manually wrap with <UncaughtProvider>.`));
    }
  } else {
    const providersContent = `'use client';\n\nimport { UncaughtProvider } from '@uncaughtdev/react';\n\nexport function Providers({ children }: { children: React.ReactNode }) {\n  return (\n    <UncaughtProvider projectKey="${projectKey}" transport="local">\n      {children}\n    </UncaughtProvider>\n  );\n}\n`;
    await fs.writeFile(providersPath, providersContent);
    console.log(c(GREEN, `  ✓ Created ${providersRel}`));
  }

  // 2. Patch layout.tsx to import and use <Providers>
  if (!await fileExists(layoutPath)) {
    const layoutContent = `import { Providers } from './providers';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>\n        <Providers>{children}</Providers>\n      </body>\n    </html>\n  );\n}\n`;
    await fs.writeFile(layoutPath, layoutContent);
    console.log(c(GREEN, `  ✓ Created ${layoutRel}`));
    return;
  }

  let content = await fs.readFile(layoutPath, 'utf-8');

  if (content.includes('UncaughtProvider') || content.includes('@uncaughtdev/react') || content.includes('./providers')) {
    console.log(c(YELLOW, `  ⊘ ${layoutRel} already has providers, skipping`));
    return;
  }

  // Add import for Providers
  content = insertImport(content, `import { Providers } from './providers';\n`);

  // Wrap {children} with <Providers>
  let patched = false;
  const childrenMatch = content.match(/(\n(\s*))\{children\}/);
  if (childrenMatch) {
    content = content.replace(`${childrenMatch[1]}{children}`, `${childrenMatch[1]}<Providers>{children}</Providers>`);
    patched = true;
  }

  if (patched) {
    await fs.writeFile(layoutPath, content);
    console.log(c(GREEN, `  ✓ Patched ${layoutRel}`));
  } else {
    console.log(c(YELLOW, `  ⚠ Could not auto-patch ${layoutRel}. Import Providers from './providers' and wrap {children}.`));
  }
}

// Pages Router / Vite / CRA patching
async function patchFileWithProvider(filePath: string, projectKey: string, mode: 'pages-app' | 'entry'): Promise<void> {
  const cwd = process.cwd();
  const rel = path.relative(cwd, filePath);

  if (!await fileExists(filePath)) {
    let content = '';
    if (mode === 'pages-app') {
      content = `import { UncaughtProvider } from '@uncaughtdev/react';\nimport type { AppProps } from 'next/app';\n\nexport default function App({ Component, pageProps }: AppProps) {\n  return (\n    <UncaughtProvider projectKey="${projectKey}" transport="local">\n      <Component {...pageProps} />\n    </UncaughtProvider>\n  );\n}\n`;
    }
    await fs.writeFile(filePath, content);
    console.log(c(GREEN, `  ✓ Created ${rel}`));
    return;
  }

  let content = await fs.readFile(filePath, 'utf-8');

  if (content.includes('UncaughtProvider') || content.includes('@uncaughtdev/react')) {
    console.log(c(YELLOW, `  ⊘ ${rel} already has UncaughtProvider, skipping`));
    return;
  }

  content = insertImport(content, `import { UncaughtProvider } from '@uncaughtdev/react';\n`);

  const transport = (mode === 'entry') ? 'console' : 'local';
  const providerOpen = `<UncaughtProvider projectKey="${projectKey}" transport="${transport}">`;
  const providerClose = `</UncaughtProvider>`;

  let patched = false;

  if (mode === 'pages-app') {
    const m = content.match(/<Component\s[^>]*\/>/);
    if (m) {
      content = content.replace(m[0], `${providerOpen}\n        ${m[0]}\n      ${providerClose}`);
      patched = true;
    }
  } else if (mode === 'entry') {
    const m = content.match(/<App\s*\/>/);
    if (m) {
      content = content.replace(m[0], `${providerOpen}\n      <App />\n    ${providerClose}`);
      patched = true;
    }
  }

  if (patched) {
    await fs.writeFile(filePath, content);
    console.log(c(GREEN, `  ✓ Patched ${rel}`));
  } else {
    console.log(c(YELLOW, `  ⚠ Could not auto-patch ${rel}. Wrap your root component with:`));
    console.log(c(GRAY, `    <UncaughtProvider projectKey="${projectKey}" transport="local">{children}</UncaughtProvider>`));
  }
}

async function patchNextConfig(cwd: string): Promise<void> {
  const candidates = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
  let cfgPath: string | null = null;
  for (const n of candidates) {
    const p = path.join(cwd, n);
    if (await fileExists(p)) { cfgPath = p; break; }
  }

  const webpackSnippet = `\n  webpack: (config, { isServer }) => {\n    if (!isServer) {\n      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, child_process: false };\n    }\n    return config;\n  },`;

  if (!cfgPath) {
    cfgPath = path.join(cwd, 'next.config.js');
    await fs.writeFile(cfgPath, `/** @type {import('next').NextConfig} */\nconst nextConfig = {${webpackSnippet}\n};\nmodule.exports = nextConfig;\n`);
    console.log(c(GREEN, `  ✓ Created next.config.js`));
    return;
  }

  let content = await fs.readFile(cfgPath, 'utf-8');

  if (content.includes('fs: false')) {
    console.log(c(YELLOW, `  ⊘ Already has webpack fallback, skipping`));
    return;
  }

  if (content.includes('webpack')) {
    console.log(c(YELLOW, `  ⊘ Has custom webpack — add manually: config.resolve.fallback = { fs: false, path: false, child_process: false }`));
    return;
  }

  const m = content.match(/(const\s+\w+\s*=\s*\{|module\.exports\s*=\s*\{|export\s+default\s*\{)/);
  if (m && m.index !== undefined) {
    const pos = m.index + m[0].length;
    content = content.slice(0, pos) + webpackSnippet + content.slice(pos);
    await fs.writeFile(cfgPath, content);
    console.log(c(GREEN, `  ✓ Patched ${path.relative(cwd, cfgPath)}`));
  } else {
    console.log(c(YELLOW, `  ⚠ Could not auto-patch. Add webpack fallback for fs/path/child_process manually.`));
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Uncaught Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; }
  a { color: #60a5fa; text-decoration: none; }
  code { background: #1e1e2e; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
  pre { background: #1e1e2e; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; line-height: 1.5; }
  header { background: #111; border-bottom: 1px solid #222; padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 1.2rem; font-weight: 600; }
  header h1 span { color: #f87171; }
  .stats { display: flex; gap: 24px; margin-left: auto; font-size: 0.85rem; color: #888; }
  .stats .stat-val { color: #e0e0e0; font-weight: 600; }
  .filters { display: flex; gap: 8px; padding: 16px 24px; border-bottom: 1px solid #1a1a1a; }
  .filter-btn { background: #1a1a1a; border: 1px solid #333; color: #aaa; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .filter-btn:hover { border-color: #555; color: #e0e0e0; }
  .filter-btn.active { background: #1e3a5f; border-color: #60a5fa; color: #60a5fa; }
  .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; padding: 12px 16px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; border-bottom: 1px solid #222; }
  td { padding: 12px 16px; border-bottom: 1px solid #1a1a1a; font-size: 0.9rem; vertical-align: top; }
  tr { cursor: pointer; transition: background 0.1s; }
  tr:hover { background: #141414; }
  tr.selected { background: #1a1a2e; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-open { background: #3b1111; color: #f87171; }
  .badge-resolved { background: #0f2f1a; color: #4ade80; }
  .badge-ignored { background: #2d2305; color: #facc15; }
  .badge-release { background: #1e1e3e; color: #a78bfa; font-size: 0.7rem; margin-left: 6px; }
  .badge-env { background: #1a2e1a; color: #86efac; font-size: 0.7rem; margin-left: 4px; }
  .env-filter { background: #1a1a1a; border: 1px solid #333; color: #aaa; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; margin-left: 8px; }
  .feedback-box { background: #1a1a2e; border: 1px solid #2e2e5c; border-radius: 8px; padding: 12px 16px; margin-top: 8px; font-style: italic; color: #c4b5fd; }
  .count { background: #1e1e2e; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; }
  .error-type { color: #f87171; font-weight: 500; font-size: 0.8rem; }
  .error-title { color: #e0e0e0; }
  .time-ago { color: #666; font-size: 0.8rem; }
  .empty { text-align: center; padding: 80px 24px; color: #555; }
  .empty h2 { font-size: 1.2rem; margin-bottom: 8px; color: #666; }

  /* Detail panel */
  .detail-overlay { display: none; position: fixed; top: 0; right: 0; bottom: 0; width: 55%; background: #111; border-left: 1px solid #222; overflow-y: auto; z-index: 100; box-shadow: -4px 0 24px rgba(0,0,0,0.5); }
  .detail-overlay.open { display: block; }
  .detail-header { padding: 20px 24px; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 12px; }
  .detail-header h2 { font-size: 1rem; flex: 1; }
  .close-btn { background: none; border: 1px solid #333; color: #aaa; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  .close-btn:hover { border-color: #666; color: #fff; }
  .detail-body { padding: 24px; }
  .detail-section { margin-bottom: 24px; }
  .detail-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 8px; }
  .detail-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .meta-item { background: #1a1a1a; padding: 12px; border-radius: 6px; }
  .meta-label { font-size: 0.7rem; text-transform: uppercase; color: #666; margin-bottom: 4px; }
  .meta-value { font-size: 0.9rem; }
  .breadcrumbs { list-style: none; }
  .breadcrumbs li { padding: 6px 0; border-bottom: 1px solid #1a1a1a; font-size: 0.85rem; display: flex; gap: 8px; }
  .bc-time { color: #666; font-family: monospace; font-size: 0.8rem; min-width: 60px; }
  .bc-type { color: #60a5fa; font-size: 0.75rem; font-weight: 600; min-width: 70px; }
  .action-bar { display: flex; gap: 8px; padding: 16px 24px; border-top: 1px solid #222; position: sticky; bottom: 0; background: #111; }
  .action-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #333; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .btn-resolve { background: #0f2f1a; color: #4ade80; border-color: #1a5c2e; }
  .btn-resolve:hover { background: #1a5c2e; }
  .btn-ignore { background: #2d2305; color: #facc15; border-color: #5c4a0a; }
  .btn-ignore:hover { background: #5c4a0a; }
  .btn-copy { background: #1a1a2e; color: #818cf8; border-color: #2e2e5c; }
  .btn-copy:hover { background: #2e2e5c; }
  .btn-open { background: #1e3a5f; color: #60a5fa; border-color: #2563eb; }
  .btn-open:hover { background: #2563eb; }

  /* Fix prompt box */
  .prompt-box { position: relative; background: #0d0d0d; border: 1px solid #222; border-radius: 8px; margin-bottom: 24px; }
  .prompt-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #222; }
  .prompt-header h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin: 0; }
  .prompt-copy-btn { background: #1a1a2e; border: 1px solid #2e2e5c; color: #818cf8; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; transition: all 0.15s; }
  .prompt-copy-btn:hover { background: #2e2e5c; }
  .prompt-copy-btn svg { width: 14px; height: 14px; }
  .prompt-content { padding: 16px; max-height: 300px; overflow-y: auto; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; font-family: 'SF Mono', 'Fira Code', monospace; color: #ccc; }

  /* Fix prompt markdown (expanded view) */
  .fix-prompt { background: #0d0d0d; border: 1px solid #222; border-radius: 8px; padding: 20px; line-height: 1.6; }
  .fix-prompt h1, .fix-prompt h2, .fix-prompt h3 { color: #e0e0e0; margin: 16px 0 8px; }
  .fix-prompt h1 { font-size: 1.2rem; }
  .fix-prompt h2 { font-size: 1rem; border-bottom: 1px solid #222; padding-bottom: 6px; }
  .fix-prompt h3 { font-size: 0.9rem; }
  .fix-prompt ul, .fix-prompt ol { padding-left: 20px; margin: 8px 0; }
  .fix-prompt li { margin: 4px 0; }
  .fix-prompt strong { color: #f0f0f0; }
  .fix-prompt p { margin: 8px 0; }
</style>
</head>
<body>
<header>
  <h1><span>uncaught</span> dashboard</h1>
  <div class="stats" id="stats"></div>
</header>
<div class="filters" id="filters">
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="open">Open</button>
  <button class="filter-btn" data-filter="resolved">Resolved</button>
  <button class="filter-btn" data-filter="ignored">Ignored</button>
  <select class="env-filter" id="env-filter">
    <option value="">All Environments</option>
  </select>
</div>
<div class="container">
  <table>
    <thead>
      <tr><th>#</th><th>Status</th><th>Error</th><th>Release</th><th>Count</th><th>Users</th><th>Last Seen</th></tr>
    </thead>
    <tbody id="issues-body"></tbody>
  </table>
  <div class="empty" id="empty" style="display:none;">
    <h2>No issues found</h2>
    <p>Trigger some errors in your app and they will appear here.</p>
  </div>
</div>
<div class="detail-overlay" id="detail">
  <div class="detail-header">
    <h2 id="detail-title"></h2>
    <button class="close-btn" id="close-detail">Close</button>
  </div>
  <div class="detail-body" id="detail-body"></div>
  <div class="action-bar" id="action-bar"></div>
</div>
<script>
let allIssues = [];
let currentFilter = 'all';
let currentEnv = '';
let selectedFp = null;

async function fetchIssues() {
  try {
    var params = [];
    if (currentFilter !== 'all') params.push('status=' + currentFilter);
    if (currentEnv) params.push('environment=' + encodeURIComponent(currentEnv));
    var url = '/api/issues' + (params.length ? '?' + params.join('&') : '');
    const res = await fetch(url);
    allIssues = await res.json();
    renderIssues();
    fetchStats();
    updateEnvFilter();
  } catch(e) { console.error('Failed to fetch issues', e); }
}

function updateEnvFilter() {
  var sel = document.getElementById('env-filter');
  var envs = new Set();
  allIssues.forEach(function(i) { if (i.environment) envs.add(i.environment); });
  var opts = '<option value="">All Environments</option>';
  envs.forEach(function(e) { opts += '<option value="' + escHtml(e) + '"' + (e === currentEnv ? ' selected' : '') + '>' + escHtml(e) + '</option>'; });
  sel.innerHTML = opts;
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    document.getElementById('stats').innerHTML =
      '<div><span class="stat-val">' + s.total + '</span> issues</div>' +
      '<div><span class="stat-val">' + s.open + '</span> open</div>' +
      '<div><span class="stat-val">' + s.totalEvents + '</span> events</div>';
  } catch(e) {}
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const s = Math.floor(ms/1000);
  if (s < 60) return s + 's ago';
  const m = Math.floor(s/60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m/60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h/24);
  if (d < 30) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderIssues() {
  const body = document.getElementById('issues-body');
  const empty = document.getElementById('empty');
  if (allIssues.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = allIssues.map(function(issue, i) {
    const cls = issue.status === 'open' ? 'badge-open' : issue.status === 'resolved' ? 'badge-resolved' : 'badge-ignored';
    var relBadge = issue.release ? '<span class="badge badge-release">' + escHtml(issue.release) + '</span>' : '<span style="color:#555">—</span>';
    var envBadge = issue.environment ? '<span class="badge badge-env">' + escHtml(issue.environment) + '</span>' : '';
    return '<tr data-fp="' + issue.fingerprint + '" class="' + (issue.fingerprint === selectedFp ? 'selected' : '') + '">' +
      '<td>' + (i+1) + '</td>' +
      '<td><span class="badge ' + cls + '">' + issue.status + '</span>' + envBadge + '</td>' +
      '<td><span class="error-type">' + escHtml(issue.errorType) + '</span> <span class="error-title">' + escHtml(issue.title.length > 60 ? issue.title.slice(0,57) + '...' : issue.title) + '</span></td>' +
      '<td>' + relBadge + '</td>' +
      '<td><span class="count">' + issue.count + '</span></td>' +
      '<td>' + issue.affectedUsers.length + '</td>' +
      '<td class="time-ago">' + timeAgo(issue.lastSeen) + '</td>' +
      '</tr>';
  }).join('');
}

function renderMd(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\`\`\`[\\s\\S]*?\`\`\`/g, function(m) {
      var code = m.replace(/\`\`\`\\w*\\n?/g, '').replace(/\`\`\`$/g, '');
      return '<pre><code>' + escHtml(code) + '</code></pre>';
    })
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/^- \\*\\*(.+?)\\*\\* ?\u2014 ?(.+)$/gm, '<li><strong>$1</strong> \u2014 $2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\\d+)\\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>')
    .replace(/\\n\\n/g, '</p><p>')
    .replace(/\\n/g, '<br>');
}

async function showDetail(fp) {
  selectedFp = fp;
  renderIssues();
  try {
    const res = await fetch('/api/issues/' + fp);
    const data = await res.json();
    const issue = data.issue;
    const event = data.event;

    document.getElementById('detail-title').textContent = issue.errorType + ': ' + issue.title;

    let html = '';

    if (event) {
      // Fix prompt — first, compact box with copy icon
      if (event.fixPrompt) {
        html += '<div class="prompt-box">';
        html += '<div class="prompt-header"><h3>Fix Prompt</h3>';
        html += '<button class="prompt-copy-btn" onclick="copyPrompt()">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        html += '<span id="copy-label">Copy</span></button></div>';
        html += '<div class="prompt-content">' + escHtml(event.fixPrompt) + '</div>';
        html += '</div>';
      }
    }

    // Meta
    html += '<div class="detail-section"><h3>Details</h3><div class="detail-meta">';
    html += '<div class="meta-item"><div class="meta-label">Fingerprint</div><div class="meta-value"><code>' + issue.fingerprint + '</code></div></div>';
    html += '<div class="meta-item"><div class="meta-label">Occurrences</div><div class="meta-value">' + issue.count + '</div></div>';
    html += '<div class="meta-item"><div class="meta-label">Users Affected</div><div class="meta-value">' + issue.affectedUsers.length + '</div></div>';
    html += '<div class="meta-item"><div class="meta-label">First Seen</div><div class="meta-value">' + timeAgo(issue.firstSeen) + '</div></div>';
    html += '<div class="meta-item"><div class="meta-label">Last Seen</div><div class="meta-value">' + timeAgo(issue.lastSeen) + '</div></div>';
    html += '<div class="meta-item"><div class="meta-label">Status</div><div class="meta-value"><span class="badge badge-' + issue.status + '">' + issue.status + '</span></div></div>';
    if (issue.release) html += '<div class="meta-item"><div class="meta-label">Release</div><div class="meta-value"><span class="badge badge-release">' + escHtml(issue.release) + '</span></div></div>';
    if (issue.environment) html += '<div class="meta-item"><div class="meta-label">Environment</div><div class="meta-value"><span class="badge badge-env">' + escHtml(issue.environment) + '</span></div></div>';
    html += '</div></div>';

    if (event) {
      // User feedback
      if (event.userFeedback) {
        html += '<div class="detail-section"><h3>User Feedback</h3><div class="feedback-box">"' + escHtml(event.userFeedback) + '"</div></div>';
      }

      // Stack trace (prefer resolved)
      var stackLabel = 'Stack Trace';
      var stackContent = '';
      if (event.error && event.error.resolvedStack) {
        stackLabel = 'Stack Trace (Source Mapped)';
        stackContent = event.error.resolvedStack;
      } else if (event.error && event.error.stack) {
        stackContent = event.error.stack;
      }
      if (stackContent) {
        html += '<div class="detail-section"><h3>' + stackLabel + '</h3><pre><code>' + escHtml(stackContent) + '</code></pre></div>';
      }

      // Environment
      if (event.environment) {
        const env = event.environment;
        html += '<div class="detail-section"><h3>Environment</h3><div class="detail-meta">';
        if (env.deploy) html += '<div class="meta-item"><div class="meta-label">Deploy Env</div><div class="meta-value">' + escHtml(env.deploy) + '</div></div>';
        if (env.browser) html += '<div class="meta-item"><div class="meta-label">Browser</div><div class="meta-value">' + escHtml(env.browser + (env.browserVersion ? ' ' + env.browserVersion : '')) + '</div></div>';
        if (env.os) html += '<div class="meta-item"><div class="meta-label">OS</div><div class="meta-value">' + escHtml(env.os) + '</div></div>';
        if (env.runtime) html += '<div class="meta-item"><div class="meta-label">Runtime</div><div class="meta-value">' + escHtml(env.runtime) + '</div></div>';
        if (env.url) html += '<div class="meta-item"><div class="meta-label">URL</div><div class="meta-value">' + escHtml(env.url) + '</div></div>';
        if (env.deviceType) html += '<div class="meta-item"><div class="meta-label">Device</div><div class="meta-value">' + escHtml(env.deviceType) + '</div></div>';
        html += '</div></div>';
      }

      // Breadcrumbs
      if (event.breadcrumbs && event.breadcrumbs.length > 0) {
        html += '<div class="detail-section"><h3>Breadcrumbs</h3><ul class="breadcrumbs">';
        event.breadcrumbs.forEach(function(bc) {
          var t = bc.timestamp ? new Date(bc.timestamp).toLocaleTimeString() : '';
          html += '<li><span class="bc-time">' + t + '</span><span class="bc-type">[' + escHtml(bc.type) + ']</span><span>' + escHtml(bc.message) + '</span></li>';
        });
        html += '</ul></div>';
      }
    }

    document.getElementById('detail-body').innerHTML = html;

    // Action bar
    let actions = '';
    if (issue.status !== 'resolved') actions += '<button class="action-btn btn-resolve" onclick="updateStatus(\\'' + fp + '\\', \\'resolved\\')">Mark Resolved</button>';
    if (issue.status !== 'ignored') actions += '<button class="action-btn btn-ignore" onclick="updateStatus(\\'' + fp + '\\', \\'ignored\\')">Mark Ignored</button>';
    if (issue.status !== 'open') actions += '<button class="action-btn btn-open" onclick="updateStatus(\\'' + fp + '\\', \\'open\\')">Reopen</button>';
    document.getElementById('action-bar').innerHTML = actions;

    document.getElementById('detail').classList.add('open');
    window._currentFixPrompt = event ? event.fixPrompt : '';
  } catch(e) { console.error('Failed to load detail', e); }
}

async function updateStatus(fp, status) {
  try {
    await fetch('/api/issues/' + fp, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status:status}) });
    fetchIssues();
    showDetail(fp);
  } catch(e) { console.error('Failed to update', e); }
}

function copyPrompt() {
  if (window._currentFixPrompt) {
    navigator.clipboard.writeText(window._currentFixPrompt).then(function() {
      var label = document.getElementById('copy-label');
      if (label) { label.textContent = 'Copied!'; setTimeout(function(){ label.textContent = 'Copy'; }, 2000); }
    });
  }
}

// Event delegation
document.getElementById('issues-body').addEventListener('click', function(e) {
  var tr = e.target.closest('tr');
  if (tr && tr.dataset.fp) showDetail(tr.dataset.fp);
});

document.getElementById('close-detail').addEventListener('click', function() {
  document.getElementById('detail').classList.remove('open');
  selectedFp = null;
  renderIssues();
});

document.getElementById('filters').addEventListener('click', function(e) {
  var btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  fetchIssues();
});

document.getElementById('env-filter').addEventListener('change', function(e) {
  currentEnv = e.target.value;
  fetchIssues();
});

// Close on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.getElementById('detail').classList.remove('open');
    selectedFp = null;
    renderIssues();
  }
});

// Initial load + auto-refresh
fetchIssues();
setInterval(fetchIssues, 5000);
</script>
</body>
</html>`;

async function cmdDashboard(port: number): Promise<void> {
  const baseDir = getBaseDir();

  // Ensure base directory exists
  await fs.mkdir(baseDir, { recursive: true });

  let store: SqliteStore;
  try {
    store = getStore();
  } catch (err) {
    console.error(c(RED, '\n  Failed to open database:'), err);
    process.exitCode = 1;
    return;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const pathname = url.pathname;

    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve dashboard
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DASHBOARD_HTML);
      return;
    }

    // REST API
    try {
      // GET /api/issues
      if (pathname === '/api/issues' && req.method === 'GET') {
        const status = url.searchParams.get('status') as IssueStatus | null;
        const environment = url.searchParams.get('environment') || undefined;
        const filter: { status?: IssueStatus; environment?: string } = {};
        if (status) filter.status = status;
        if (environment) filter.environment = environment;
        const issues = Object.keys(filter).length > 0 ? store.getIssues(filter) : store.getIssues();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(issues));
        return;
      }

      // GET /api/stats
      if (pathname === '/api/stats' && req.method === 'GET') {
        const stats = store.getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
        return;
      }

      // Match /api/issues/:fp and /api/issues/:fp/events
      const issueMatch = pathname.match(/^\/api\/issues\/([a-f0-9]+)$/);
      const eventsMatch = pathname.match(/^\/api\/issues\/([a-f0-9]+)\/events$/);

      // GET /api/issues/:fp/events
      if (eventsMatch && req.method === 'GET') {
        const fp = eventsMatch[1];
        const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
        const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
        const events = store.getEvents(fp, { limit, offset });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(events));
        return;
      }

      // GET /api/issues/:fp
      if (issueMatch && req.method === 'GET') {
        const fp = issueMatch[1];
        const issue = store.getIssue(fp);
        if (!issue) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Issue not found' }));
          return;
        }
        const event = store.getLatestEvent(fp);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ issue, event: event ?? null }));
        return;
      }

      // PATCH /api/issues/:fp
      if (issueMatch && req.method === 'PATCH') {
        const fp = issueMatch[1];
        const body = await readBody(req);
        const { status } = JSON.parse(body) as { status: IssueStatus };
        store.updateIssueStatus(fp, status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // DELETE /api/issues
      if (pathname === '/api/issues' && req.method === 'DELETE') {
        store.deleteAllIssues();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(c(RED, `\n  Port ${port} is already in use. Try: npx @uncaughtdev/core dashboard --port ${port + 1}\n`));
      process.exitCode = 1;
    } else {
      console.error(c(RED, '\n  Server error:'), err);
      process.exitCode = 1;
    }
  });

  server.listen(port, () => {
    console.log('');
    console.log(c(BOLD, '  uncaught dashboard'));
    console.log(c(DIM, '  ─'.repeat(35)));
    console.log('');
    console.log(`  ${c(GREEN, '●')} Running at ${c(CYAN, `http://localhost:${port}`)}`);
    console.log('');
    console.log(c(DIM, '  Press Ctrl+C to stop'));
    console.log('');

    // Auto-open browser
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try {
      const child = spawn(openCmd, [`http://localhost:${port}`], { detached: true, stdio: 'ignore' });
      child.unref();
    } catch {
      // Could not open browser — user can navigate manually
    }
  });

  // Keep process alive
  process.on('SIGINT', () => {
    console.log(c(DIM, '\n  Shutting down...'));
    store.close();
    server.close();
    process.exit(0);
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'list';

  switch (command) {
    case 'init':
    case 'setup':
      await cmdInit();
      break;

    case 'list':
    case 'ls':
      await cmdList();
      break;

    case 'show':
    case 'view': {
      const num = args[1];
      if (!num) {
        console.error(c(RED, '\n  Missing issue number. Usage: uncaught show <n>\n'));
        process.exitCode = 1;
        return;
      }
      const openFlag = args.includes('--open') || args.includes('-o');
      await cmdShow(num, openFlag);
      break;
    }

    case 'resolve': {
      const num = args[1];
      if (!num) {
        console.error(
          c(RED, '\n  Missing issue number. Usage: uncaught resolve <n>\n')
        );
        process.exitCode = 1;
        return;
      }
      await cmdResolve(num);
      break;
    }

    case 'clear':
    case 'clean':
      await cmdClear();
      break;

    case 'dashboard':
    case 'dash':
    case 'ui': {
      const portIdx = args.indexOf('--port');
      const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) || 3300 : 3300;
      await cmdDashboard(port);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;

    default:
      console.error(c(RED, `\n  Unknown command: ${command}`));
      printUsage();
      process.exitCode = 1;
      break;
  }
}

main().catch((err) => {
  console.error(c(RED, '\n  Unexpected error:'), err);
  process.exitCode = 1;
});
