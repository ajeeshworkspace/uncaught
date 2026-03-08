<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Error fingerprinting — generates stable DJB2 hashes for error grouping.
 */
final class Fingerprint
{
    /**
     * Generate a stable fingerprint for an error.
     *
     * @param array{message?: string, type?: string, stack?: string} $error
     */
    public static function generate(array $error): string
    {
        $normalisedMessage = self::normaliseMessage($error['message'] ?? '');
        $frames = self::extractTopFrames($error['stack'] ?? '', 3);

        $input = implode("\n", array_merge(
            [$error['type'] ?? 'Error', $normalisedMessage],
            $frames
        ));

        return self::djb2($input);
    }

    /**
     * DJB2 hash -> 8-character lowercase hex string.
     *
     * Uses signed 32-bit arithmetic with & 0xFFFFFFFF masking to produce
     * identical results to the TypeScript reference implementation.
     */
    public static function djb2(string $str): string
    {
        $hash = 5381;

        for ($i = 0; $i < strlen($str); $i++) {
            $hash = (($hash << 5) + $hash + ord($str[$i])) & 0xFFFFFFFF;
            if ($hash >= 0x80000000) {
                $hash -= 0x100000000;
            }
        }

        return sprintf('%08x', $hash & 0xFFFFFFFF);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Strip volatile substrings from an error message.
     */
    private static function normaliseMessage(string $msg): string
    {
        // UUIDs
        $msg = preg_replace(
            '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i',
            '<UUID>',
            $msg
        );

        // Hex strings (8+ hex chars)
        $msg = preg_replace('/\b[0-9a-f]{8,}\b/i', '<HEX>', $msg);

        // Numbers longer than 3 digits
        $msg = preg_replace('/\b\d{4,}\b/', '<NUM>', $msg);

        // ISO timestamps
        $msg = preg_replace(
            '/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?/',
            '<TIMESTAMP>',
            $msg
        );

        // Hashed file paths
        $msg = preg_replace(
            '#([/\\\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\.(js|ts|mjs|cjs|jsx|tsx)#',
            '$1<FILE>.$3',
            $msg
        );

        return trim($msg);
    }

    /**
     * Extract the top N stack frames as normalised "file:function" strings.
     *
     * @return string[]
     */
    private static function extractTopFrames(string $stack, int $count): array
    {
        if ($stack === '') {
            return [];
        }

        $frames = [];
        $lines = explode("\n", $stack);

        foreach ($lines as $line) {
            if (count($frames) >= $count) {
                break;
            }

            $trimmed = trim($line);

            // PHP stack trace format: "#0 /path/to/file.php(42): ClassName->method()"
            if (preg_match('/^#\d+\s+(.+?)\((\d+)\):\s+(.+)/', $trimmed, $matches)) {
                $file = self::normalisePath($matches[1]);
                $func = $matches[3];
                // Strip arguments from function call
                $func = preg_replace('/\(.*\)$/', '', $func);
                $frames[] = "{$file}:{$func}";
                continue;
            }

            // V8 format: "    at FunctionName (file:line:col)"
            if (preg_match('/at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?/', $trimmed, $matches)) {
                $func = $matches[1] ?: '<anonymous>';
                $file = self::normalisePath($matches[2] ?? '<unknown>');
                $frames[] = "{$file}:{$func}";
                continue;
            }
        }

        return $frames;
    }

    /**
     * Normalise a file path.
     */
    private static function normalisePath(string $path): string
    {
        // Strip query / hash
        $path = preg_replace('/[?#].*$/', '', $path);
        // Collapse deep paths to vendor
        $path = preg_replace('#^.*/vendor/#', 'vendor/', $path);
        // Strip origin in URLs
        $path = preg_replace('#^https?://[^/]+#', '', $path);
        // Keep only filename
        $path = preg_replace('#^.*[/\\\\]#', '', $path);
        return $path;
    }
}
