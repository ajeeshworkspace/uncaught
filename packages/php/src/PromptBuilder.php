<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Fix-prompt builder — generates structured Markdown prompts for AI assistants.
 */
final class PromptBuilder
{
    /**
     * Build a structured Markdown prompt for diagnosing and fixing the error.
     */
    public static function build(array $event): string
    {
        $sections = [];

        // Intro
        $sections[] = "I have a production bug in my application that I need help diagnosing and fixing.\n";

        // Error section
        if (isset($event['error'])) {
            $error = $event['error'];
            $location = self::extractLocation($error['stack'] ?? null);
            $lines = ['## Error', ''];
            $lines[] = '- **Type:** ' . ($error['type'] ?? 'Error');
            $lines[] = '- **Message:** ' . ($error['message'] ?? '(no message)');
            if ($location !== null) {
                $lines[] = "- **Location:** {$location}";
            }
            $sections[] = implode("\n", $lines);
        }

        // Stack Trace
        $stackSource = $event['error']['resolvedStack'] ?? $event['error']['stack'] ?? null;
        if ($stackSource !== null) {
            $frames = array_slice(explode("\n", $stackSource), 0, 15);
            $frames = array_map('rtrim', $frames);
            $label = isset($event['error']['resolvedStack'])
                ? 'Stack Trace (source-mapped)'
                : 'Stack Trace';
            $sections[] = "## {$label}\n\n```\n" . implode("\n", $frames) . "\n```";
        }

        // Failed Operation
        if (isset($event['operation'])) {
            $sections[] = self::formatOperation($event['operation']);
        }

        // HTTP Request Context
        if (isset($event['request'])) {
            $sections[] = self::formatRequest($event['request']);
        }

        // User Session (last 5 breadcrumbs)
        if (!empty($event['breadcrumbs'])) {
            $sections[] = self::formatBreadcrumbs($event['breadcrumbs']);
        }

        // Environment
        if (isset($event['environment'])) {
            $sections[] = self::formatEnvironment($event['environment']);
        }

        // What I need
        $sections[] = implode("\n", [
            '## What I need',
            '',
            '1. **Root cause analysis** — explain why this error is occurring.',
            '2. **A fix** — provide the corrected code with an explanation of the changes.',
            '3. **Prevention** — suggest any guards or tests to prevent this from happening again.',
        ]);

        return implode("\n\n", $sections) . "\n";
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static function extractLocation(?string $stack): ?string
    {
        if ($stack === null) {
            return null;
        }

        foreach (explode("\n", $stack) as $line) {
            $trimmed = trim($line);

            // PHP format: "#0 /path/to/file.php(42): ClassName->method()"
            if (preg_match('/^#\d+\s+(.+?\(\d+\))/', $trimmed, $matches)) {
                return $matches[1];
            }

            // V8: "    at fn (file:line:col)"
            if (preg_match('/at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?/', $trimmed, $matches)) {
                return $matches[1];
            }
        }

        return null;
    }

    private static function formatOperation(array $op): string
    {
        $lines = ['## Failed Operation', ''];
        $lines[] = '- **Provider:** ' . ($op['provider'] ?? '');
        $lines[] = '- **Type:** ' . ($op['type'] ?? '');
        $lines[] = '- **Method:** ' . ($op['method'] ?? '');
        if (isset($op['params'])) {
            $lines[] = '- **Params:**';
            $lines[] = '```json';
            $lines[] = json_encode($op['params'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            $lines[] = '```';
        }
        if (isset($op['errorCode'])) {
            $lines[] = "- **Error Code:** {$op['errorCode']}";
        }
        if (isset($op['errorDetails'])) {
            $lines[] = "- **Error Details:** {$op['errorDetails']}";
        }
        return implode("\n", $lines);
    }

    private static function formatRequest(array $req): string
    {
        $lines = ['## HTTP Request Context', ''];
        if (isset($req['method'])) {
            $lines[] = "- **Method:** {$req['method']}";
        }
        if (isset($req['url'])) {
            $lines[] = "- **URL:** {$req['url']}";
        }
        if (isset($req['body'])) {
            $lines[] = '- **Body:**';
            $lines[] = '```json';
            $lines[] = is_string($req['body'])
                ? $req['body']
                : json_encode($req['body'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            $lines[] = '```';
        }
        return implode("\n", $lines);
    }

    private static function formatBreadcrumbs(array $crumbs): string
    {
        $recent = array_slice($crumbs, -5);
        $lines = ['## User Session', ''];

        foreach ($recent as $crumb) {
            $time = self::formatTime($crumb['timestamp'] ?? '');
            $type = $crumb['type'] ?? 'custom';
            $message = $crumb['message'] ?? '';
            $lines[] = "- `{$time}` **[{$type}]** {$message}";
        }

        return implode("\n", $lines);
    }

    private static function formatTime(string $iso): string
    {
        try {
            $dt = new \DateTimeImmutable($iso);
            return $dt->format('H:i:s');
        } catch (\Throwable) {
            return $iso;
        }
    }

    private static function formatEnvironment(array $env): string
    {
        $lines = ['## Environment', ''];

        $entries = [
            ['Deploy Environment', $env['deploy'] ?? null],
            ['Framework', $env['framework'] ?? null],
            ['Framework Version', $env['frameworkVersion'] ?? null],
            ['Runtime', $env['runtime'] ?? null],
            ['Runtime Version', $env['runtimeVersion'] ?? null],
            ['Platform', $env['platform'] ?? null],
            ['Browser', isset($env['browser']) ? trim(($env['browser'] ?? '') . ' ' . ($env['browserVersion'] ?? '')) : null],
            ['OS', $env['os'] ?? null],
            ['Device', $env['deviceType'] ?? null],
            ['Locale', $env['locale'] ?? null],
            ['Timezone', $env['timezone'] ?? null],
            ['URL', $env['url'] ?? null],
        ];

        foreach ($entries as [$label, $value]) {
            if ($value !== null && $value !== '') {
                $lines[] = "- **{$label}:** {$value}";
            }
        }

        return implode("\n", $lines);
    }
}
