#!/usr/bin/env node
// ---------------------------------------------------------------------------
// @uncaught/core — local viewer CLI  (`npx uncaught` / `uncaught`)
// ---------------------------------------------------------------------------

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import type { IssueEntry, IssueStatus } from './types';

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

async function loadIssues(): Promise<IssueEntry[]> {
  try {
    const raw = await fs.readFile(getIssuesPath(), 'utf-8');
    return JSON.parse(raw) as IssueEntry[];
  } catch {
    return [];
  }
}

async function saveIssues(issues: IssueEntry[]): Promise<void> {
  const indexPath = getIssuesPath();
  const tmpPath = indexPath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(issues, null, 2), 'utf-8');
  await fs.rename(tmpPath, indexPath);
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
    ${c(CYAN, 'npx uncaught init')}            Auto-detect framework, install, and patch — one command

${c(BOLD, '  Viewer:')}
    uncaught                  List all captured issues
    uncaught list             List all captured issues
    uncaught show <n>         Display fix prompt for issue #n
    uncaught show <n> --open  Open fix prompt in $EDITOR (or VS Code)
    uncaught resolve <n>      Mark issue #n as resolved
    uncaught clear            Remove all captured issues

${c(BOLD, '  Examples:')}
    uncaught init             Setup Uncaught in your project
    uncaught show 1           Print fix prompt for issue #1
    uncaught show 3 --open    Open issue #3's prompt in your editor
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
  const pkgs = ['@uncaught/core', '@uncaught/react'];
  if (det.hasSupabase) pkgs.push('@uncaught/supabase');
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

    // Layout
    console.log(c(CYAN, '  ▸ Patching layout...'));
    const layoutPath = path.join(appDir, `layout.${ext}`);
    await patchFileWithProvider(layoutPath, projectKey, 'layout');

    // API route
    console.log(c(CYAN, '  ▸ Creating API route...'));
    const routeDir = path.join(appDir, 'api', 'uncaught', 'local');
    await fs.mkdir(routeDir, { recursive: true });
    const routePath = path.join(routeDir, `route.${tsExt}`);
    if (!await fileExists(routePath)) {
      await fs.writeFile(routePath, `export { POST } from '@uncaught/core/local-api-handler';\n`);
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
      await fs.writeFile(routePath, `export { default } from '@uncaught/core/local-api-handler/pages';\n`);
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
    console.log(c(GRAY, "    import { wrapSupabase } from '@uncaught/supabase';"));
    console.log(c(GRAY, '    const supabase = wrapSupabase(createClient(url, key));'));
  }

  // Done
  console.log('');
  console.log(c(GREEN, '  ✓ Done! Uncaught is now tracking errors.'));
  console.log('');
  console.log(c(WHITE, '    Start your dev server, trigger an error, then:'));
  console.log(c(CYAN, `    npx uncaught`));
  console.log('');
}

// ---------------------------------------------------------------------------
// File patching
// ---------------------------------------------------------------------------

async function patchFileWithProvider(filePath: string, projectKey: string, mode: 'layout' | 'pages-app' | 'entry'): Promise<void> {
  const cwd = process.cwd();
  const rel = path.relative(cwd, filePath);

  if (!await fileExists(filePath)) {
    // Create new file from scratch
    let content = '';
    if (mode === 'layout') {
      content = `'use client';\n\nimport { UncaughtProvider } from '@uncaught/react';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>\n        <UncaughtProvider projectKey="${projectKey}" transport="local">\n          {children}\n        </UncaughtProvider>\n      </body>\n    </html>\n  );\n}\n`;
    } else if (mode === 'pages-app') {
      content = `import { UncaughtProvider } from '@uncaught/react';\nimport type { AppProps } from 'next/app';\n\nexport default function App({ Component, pageProps }: AppProps) {\n  return (\n    <UncaughtProvider projectKey="${projectKey}" transport="local">\n      <Component {...pageProps} />\n    </UncaughtProvider>\n  );\n}\n`;
    }
    await fs.writeFile(filePath, content);
    console.log(c(GREEN, `  ✓ Created ${rel}`));
    return;
  }

  // Patch existing file
  let content = await fs.readFile(filePath, 'utf-8');

  if (content.includes('UncaughtProvider') || content.includes('@uncaught/react')) {
    console.log(c(YELLOW, `  ⊘ ${rel} already has UncaughtProvider, skipping`));
    return;
  }

  // Ensure 'use client' for Next.js App Router layout
  if (mode === 'layout' && !content.includes("'use client'") && !content.includes('"use client"')) {
    content = `'use client';\n\n${content}`;
  }

  // Add import
  content = insertImport(content, `import { UncaughtProvider } from '@uncaught/react';\n`);

  // Wrap children/component
  const transport = (mode === 'entry') ? 'console' : 'local';
  const providerOpen = `<UncaughtProvider projectKey="${projectKey}" transport="${transport}">`;
  const providerClose = `</UncaughtProvider>`;

  let patched = false;

  if (mode === 'layout' && content.includes('{children}')) {
    // Detect indentation around {children}
    const childrenMatch = content.match(/(\n(\s*))\{children\}/);
    if (childrenMatch) {
      const indent = childrenMatch[2];
      content = content.replace(`${childrenMatch[1]}{children}`, `${childrenMatch[1]}${providerOpen}${childrenMatch[1]}  {children}${childrenMatch[1]}${providerClose}`);
    } else {
      content = content.replace('{children}', `\n          ${providerOpen}\n            {children}\n          ${providerClose}\n        `);
    }
    patched = true;
  } else if (mode === 'pages-app') {
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
