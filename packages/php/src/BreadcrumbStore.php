<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Fixed-capacity ring-buffer store for breadcrumbs.
 *
 * - O(1) add
 * - Oldest entries are silently overwritten when capacity is reached.
 * - Returned arrays are always copies.
 */
class BreadcrumbStore
{
    private array $buffer;
    private int $capacity;
    private int $head = 0;
    private int $size = 0;

    public function __construct(int $capacity = 20)
    {
        $this->capacity = max(1, $capacity);
        $this->buffer = array_fill(0, $this->capacity, null);
    }

    /**
     * Append a breadcrumb with an auto-generated timestamp.
     *
     * @param array{type: string, category: string, message: string, data?: array|null, level?: string|null} $crumb
     */
    public function add(array $crumb): void
    {
        $entry = array_merge($crumb, [
            'timestamp' => gmdate('Y-m-d\TH:i:s.v\Z'),
        ]);

        $this->buffer[$this->head] = $entry;
        $this->head = ($this->head + 1) % $this->capacity;

        if ($this->size < $this->capacity) {
            $this->size++;
        }
    }

    /**
     * Return all stored breadcrumbs in chronological order.
     *
     * @return array<int, array>
     */
    public function getAll(): array
    {
        if ($this->size === 0) {
            return [];
        }

        $result = [];
        $start = ($this->head - $this->size + $this->capacity) % $this->capacity;

        for ($i = 0; $i < $this->size; $i++) {
            $idx = ($start + $i) % $this->capacity;
            if ($this->buffer[$idx] !== null) {
                $result[] = $this->buffer[$idx];
            }
        }

        return $result;
    }

    /**
     * Return the most recent N breadcrumbs.
     *
     * @return array<int, array>
     */
    public function getLast(int $n): array
    {
        if ($n <= 0 || $this->size === 0) {
            return [];
        }

        $count = min($n, $this->size);
        $result = [];

        for ($i = 0; $i < $count; $i++) {
            $idx = ($this->head - 1 - $i + $this->capacity) % $this->capacity;
            if ($this->buffer[$idx] !== null) {
                array_unshift($result, $this->buffer[$idx]);
            }
        }

        return $result;
    }

    /**
     * Empty the buffer.
     */
    public function clear(): void
    {
        $this->buffer = array_fill(0, $this->capacity, null);
        $this->head = 0;
        $this->size = 0;
    }
}
