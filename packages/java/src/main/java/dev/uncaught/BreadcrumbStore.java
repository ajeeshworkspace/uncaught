// ---------------------------------------------------------------------------
// dev.uncaught — thread-safe breadcrumb ring buffer
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

/**
 * A fixed-capacity, thread-safe ring buffer for breadcrumbs.
 * <p>
 * Uses {@code synchronized} with a {@link LinkedList} backing store.
 * Oldest entries are silently discarded when capacity is reached.
 * Returned lists are always defensive copies.
 */
public class BreadcrumbStore {

    private final int capacity;
    private final LinkedList<Types.Breadcrumb> buffer;

    /**
     * Create a ring buffer with the given capacity.
     *
     * @param capacity maximum number of breadcrumbs retained (defaults to 20)
     */
    public BreadcrumbStore(int capacity) {
        this.capacity = capacity > 0 ? capacity : 20;
        this.buffer = new LinkedList<>();
    }

    public BreadcrumbStore() {
        this(20);
    }

    /**
     * Append a breadcrumb. The timestamp is set automatically to the current
     * UTC instant (ISO 8601).
     */
    public synchronized void add(Types.Breadcrumb crumb) {
        if (crumb == null) return;

        Types.Breadcrumb entry = crumb.copy();
        entry.setTimestamp(Instant.now().toString());

        buffer.addLast(entry);
        if (buffer.size() > capacity) {
            buffer.removeFirst();
        }
    }

    /**
     * Return all stored breadcrumbs in chronological order (defensive copies).
     */
    public synchronized List<Types.Breadcrumb> getAll() {
        List<Types.Breadcrumb> result = new ArrayList<>(buffer.size());
        for (Types.Breadcrumb b : buffer) {
            result.add(b.copy());
        }
        return result;
    }

    /**
     * Return the most recent {@code n} breadcrumbs in chronological order.
     */
    public synchronized List<Types.Breadcrumb> getLast(int n) {
        if (n <= 0) return new ArrayList<>();
        int count = Math.min(n, buffer.size());
        List<Types.Breadcrumb> result = new ArrayList<>(count);
        int start = buffer.size() - count;
        for (int i = start; i < buffer.size(); i++) {
            result.add(buffer.get(i).copy());
        }
        return result;
    }

    /**
     * Empty the buffer.
     */
    public synchronized void clear() {
        buffer.clear();
    }

    /**
     * Return the current number of stored breadcrumbs.
     */
    public synchronized int size() {
        return buffer.size();
    }
}
