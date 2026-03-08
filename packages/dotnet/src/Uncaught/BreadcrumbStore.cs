// ---------------------------------------------------------------------------
// Uncaught — thread-safe breadcrumb ring-buffer store
// ---------------------------------------------------------------------------

namespace Uncaught;

/// <summary>
/// Thread-safe ring-buffer store for breadcrumbs.
///
/// O(1) add. Oldest entries are silently overwritten when capacity is reached.
/// Returned lists are always copies -- callers cannot mutate internal state.
/// </summary>
public sealed class BreadcrumbStore
{
    private readonly Breadcrumb?[] _buffer;
    private readonly int _capacity;
    private readonly object _lock = new();
    private int _head; // next write index
    private int _size; // current number of entries

    public BreadcrumbStore(int capacity = 20)
    {
        _capacity = Math.Max(1, capacity);
        _buffer = new Breadcrumb[_capacity];
    }

    /// <summary>
    /// Append a breadcrumb. If the buffer is at capacity, the oldest
    /// entry is discarded.
    /// </summary>
    public void Add(Breadcrumb crumb)
    {
        lock (_lock)
        {
            _buffer[_head] = crumb;
            _head = (_head + 1) % _capacity;

            if (_size < _capacity)
            {
                _size++;
            }
        }
    }

    /// <summary>
    /// Return all stored breadcrumbs in chronological order (copies).
    /// </summary>
    public List<Breadcrumb> GetAll()
    {
        lock (_lock)
        {
            if (_size == 0) return new List<Breadcrumb>();

            var result = new List<Breadcrumb>(_size);
            var start = (_head - _size + _capacity) % _capacity;

            for (var i = 0; i < _size; i++)
            {
                var idx = (start + i) % _capacity;
                var entry = _buffer[idx];
                if (entry != null)
                {
                    result.Add(entry);
                }
            }

            return result;
        }
    }

    /// <summary>
    /// Return the most recent N breadcrumbs (copies).
    /// </summary>
    public List<Breadcrumb> GetLast(int n)
    {
        lock (_lock)
        {
            if (n <= 0 || _size == 0) return new List<Breadcrumb>();

            var count = Math.Min(n, _size);
            var result = new List<Breadcrumb>(count);

            // Walk backwards from the most recent entry
            for (var i = count - 1; i >= 0; i--)
            {
                var idx = (_head - 1 - i + _capacity) % _capacity;
                var entry = _buffer[idx];
                if (entry != null)
                {
                    result.Add(entry);
                }
            }

            return result;
        }
    }

    /// <summary>
    /// Empty the buffer.
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            Array.Fill(_buffer, null);
            _head = 0;
            _size = 0;
        }
    }
}
