<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * PII / secret sanitizer — deep-walks arrays and redacts sensitive keys.
 */
final class Sanitizer
{
    /** Default key patterns that are always redacted. */
    private const DEFAULT_SENSITIVE_KEYS = [
        'password',
        'passwd',
        'secret',
        'token',
        'apikey',
        'api_key',
        'authorization',
        'credit_card',
        'creditcard',
        'card_number',
        'cvv',
        'ssn',
        'social_security',
        'private_key',
        'access_token',
        'refresh_token',
        'session_id',
        'cookie',
    ];

    /** Headers that are always stripped regardless of key matching. */
    private const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie'];

    private const REDACTED = '[REDACTED]';
    private const MAX_STRING_LENGTH = 2048;

    /**
     * Deep-clone and sanitise a value, redacting values whose keys match
     * sensitive patterns.
     *
     * @param mixed $obj The value to sanitise.
     * @param string[] $additionalKeys Extra key patterns to redact.
     * @return mixed
     */
    public static function sanitize(mixed $obj, array $additionalKeys = []): mixed
    {
        $allKeys = array_merge(self::DEFAULT_SENSITIVE_KEYS, $additionalKeys);
        $pattern = self::buildKeyPattern($allKeys);

        return self::walk($obj, null, $pattern);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static function buildKeyPattern(array $keys): string
    {
        $escaped = array_map(fn(string $k) => preg_quote($k, '/'), $keys);
        return '/' . implode('|', $escaped) . '/i';
    }

    private static function walk(mixed $value, ?string $key, string $pattern): mixed
    {
        // Redact if the current key is sensitive
        if ($key !== null && preg_match($pattern, $key)) {
            return self::REDACTED;
        }

        // Always strip sensitive headers
        if ($key !== null && in_array(strtolower($key), self::SENSITIVE_HEADERS, true)) {
            return self::REDACTED;
        }

        // Primitives
        if ($value === null || is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        // Strings — truncate if too long
        if (is_string($value)) {
            if (strlen($value) > self::MAX_STRING_LENGTH) {
                return substr($value, 0, self::MAX_STRING_LENGTH) . '...[truncated]';
            }
            return $value;
        }

        // Arrays (both indexed and associative)
        if (is_array($value)) {
            $result = [];
            $isList = array_is_list($value);

            foreach ($value as $k => $v) {
                if ($isList) {
                    $result[] = self::walk($v, null, $pattern);
                } else {
                    $result[$k] = self::walk($v, (string)$k, $pattern);
                }
            }

            return $result;
        }

        // Objects — convert to array, walk, return array
        if (is_object($value)) {
            $arr = (array)$value;
            $result = [];
            foreach ($arr as $k => $v) {
                $result[$k] = self::walk($v, (string)$k, $pattern);
            }
            return $result;
        }

        return $value;
    }
}
