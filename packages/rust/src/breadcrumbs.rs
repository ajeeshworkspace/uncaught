// ---------------------------------------------------------------------------
// uncaught — breadcrumb ring-buffer store (thread-safe)
// ---------------------------------------------------------------------------

use std::collections::VecDeque;
use std::sync::Mutex;

use crate::types::Breadcrumb;

/// Thread-safe breadcrumb ring-buffer store.
///
/// - O(1) `add`
/// - Oldest entries are silently overwritten when capacity is reached.
/// - Returned vectors are always copies -- callers cannot mutate internal state.
pub struct BreadcrumbStore {
    buffer: Mutex<VecDeque<Breadcrumb>>,
    capacity: usize,
}

impl BreadcrumbStore {
    /// Create a new store with the given capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    /// Append a breadcrumb. If the buffer is at capacity, the oldest entry
    /// is discarded.
    pub fn add(&self, crumb: Breadcrumb) {
        if let Ok(mut buf) = self.buffer.lock() {
            if buf.len() >= self.capacity {
                buf.pop_front();
            }
            buf.push_back(crumb);
        }
    }

    /// Return all stored breadcrumbs in chronological order (copies).
    pub fn get_all(&self) -> Vec<Breadcrumb> {
        self.buffer
            .lock()
            .map(|buf| buf.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Return the most recent `n` breadcrumbs (copies).
    pub fn get_last(&self, n: usize) -> Vec<Breadcrumb> {
        self.buffer
            .lock()
            .map(|buf| {
                let skip = buf.len().saturating_sub(n);
                buf.iter().skip(skip).cloned().collect()
            })
            .unwrap_or_default()
    }

    /// Empty the buffer.
    pub fn clear(&self) {
        if let Ok(mut buf) = self.buffer.lock() {
            buf.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BreadcrumbType;

    fn make_crumb(msg: &str) -> Breadcrumb {
        Breadcrumb {
            crumb_type: BreadcrumbType::Custom,
            category: "test".to_string(),
            message: msg.to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            data: None,
            level: None,
        }
    }

    #[test]
    fn test_add_and_get_all() {
        let store = BreadcrumbStore::new(3);
        store.add(make_crumb("a"));
        store.add(make_crumb("b"));

        let all = store.get_all();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].message, "a");
        assert_eq!(all[1].message, "b");
    }

    #[test]
    fn test_capacity_overflow() {
        let store = BreadcrumbStore::new(2);
        store.add(make_crumb("a"));
        store.add(make_crumb("b"));
        store.add(make_crumb("c"));

        let all = store.get_all();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].message, "b");
        assert_eq!(all[1].message, "c");
    }

    #[test]
    fn test_get_last() {
        let store = BreadcrumbStore::new(5);
        store.add(make_crumb("a"));
        store.add(make_crumb("b"));
        store.add(make_crumb("c"));

        let last = store.get_last(2);
        assert_eq!(last.len(), 2);
        assert_eq!(last[0].message, "b");
        assert_eq!(last[1].message, "c");
    }

    #[test]
    fn test_clear() {
        let store = BreadcrumbStore::new(5);
        store.add(make_crumb("a"));
        store.clear();
        assert_eq!(store.get_all().len(), 0);
    }
}
