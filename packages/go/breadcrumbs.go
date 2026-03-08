// ---------------------------------------------------------------------------
// uncaught-go — breadcrumb ring-buffer store (thread-safe)
// ---------------------------------------------------------------------------

package uncaught

import (
	"sync"
)

// BreadcrumbStore is a thread-safe, fixed-capacity ring buffer for breadcrumbs.
// O(1) add. Oldest entries are silently overwritten when capacity is reached.
type BreadcrumbStore struct {
	mu       sync.Mutex
	buffer   []Breadcrumb
	capacity int
	head     int // next write index
	size     int // current number of entries
}

// NewBreadcrumbStore creates a new BreadcrumbStore with the given capacity.
// If capacity <= 0, it defaults to 20.
func NewBreadcrumbStore(capacity int) *BreadcrumbStore {
	if capacity <= 0 {
		capacity = 20
	}
	return &BreadcrumbStore{
		buffer:   make([]Breadcrumb, capacity),
		capacity: capacity,
	}
}

// Add appends a breadcrumb to the ring buffer. The timestamp is automatically set.
func (bs *BreadcrumbStore) Add(crumb Breadcrumb) {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	crumb.Timestamp = ISOTimestamp()
	bs.buffer[bs.head] = crumb
	bs.head = (bs.head + 1) % bs.capacity
	if bs.size < bs.capacity {
		bs.size++
	}
}

// GetAll returns all stored breadcrumbs in chronological order (copies).
func (bs *BreadcrumbStore) GetAll() []Breadcrumb {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	if bs.size == 0 {
		return nil
	}

	result := make([]Breadcrumb, 0, bs.size)
	start := (bs.head - bs.size + bs.capacity) % bs.capacity

	for i := 0; i < bs.size; i++ {
		idx := (start + i) % bs.capacity
		entry := bs.buffer[idx]
		result = append(result, entry)
	}

	return result
}

// GetLast returns the most recent n breadcrumbs in chronological order (copies).
func (bs *BreadcrumbStore) GetLast(n int) []Breadcrumb {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	if n <= 0 || bs.size == 0 {
		return nil
	}

	count := n
	if count > bs.size {
		count = bs.size
	}

	result := make([]Breadcrumb, count)
	for i := 0; i < count; i++ {
		idx := (bs.head - count + i + bs.capacity) % bs.capacity
		result[i] = bs.buffer[idx]
	}

	return result
}

// Clear empties the buffer.
func (bs *BreadcrumbStore) Clear() {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	bs.buffer = make([]Breadcrumb, bs.capacity)
	bs.head = 0
	bs.size = 0
}

// Size returns the current number of entries in the buffer.
func (bs *BreadcrumbStore) Size() int {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	return bs.size
}
