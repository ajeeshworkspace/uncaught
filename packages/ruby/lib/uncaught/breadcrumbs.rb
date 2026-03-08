# frozen_string_literal: true

module Uncaught
  # Thread-safe ring buffer for breadcrumbs.
  #
  # - O(1) add
  # - Oldest entries are silently overwritten when capacity is reached.
  # - Returned arrays are always copies -- callers cannot mutate internal state.
  class BreadcrumbStore
    # @param capacity [Integer] Maximum breadcrumbs retained. Defaults to 20.
    def initialize(capacity = 20)
      @capacity = [capacity, 1].max
      @buffer = Array.new(@capacity)
      @head = 0
      @size = 0
      @mutex = Mutex.new
    end

    # Append a breadcrumb (auto-timestamps).
    #
    # @param type     [String]
    # @param category [String]
    # @param message  [String]
    # @param data     [Hash, nil]
    # @param level    [String, nil]
    def add(type:, category:, message:, data: nil, level: nil)
      entry = Breadcrumb.new(
        type: type,
        category: category,
        message: message,
        timestamp: Time.now.utc.iso8601(3),
        data: data,
        level: level
      )

      @mutex.synchronize do
        @buffer[@head] = entry
        @head = (@head + 1) % @capacity
        @size = [@size + 1, @capacity].min
      end
    end

    # Return all stored breadcrumbs in chronological order (copies).
    #
    # @return [Array<Breadcrumb>]
    def get_all
      @mutex.synchronize do
        return [] if @size == 0

        result = []
        start = (@head - @size + @capacity) % @capacity
        @size.times do |i|
          idx = (start + i) % @capacity
          entry = @buffer[idx]
          result << entry.dup if entry
        end
        result
      end
    end

    # Return the most recent n breadcrumbs (copies).
    #
    # @param n [Integer]
    # @return [Array<Breadcrumb>]
    def get_last(n)
      @mutex.synchronize do
        return [] if n <= 0 || @size == 0

        count = [n, @size].min
        result = []
        count.times do |i|
          idx = (@head - 1 - i + @capacity) % @capacity
          entry = @buffer[idx]
          result.unshift(entry.dup) if entry
        end
        result
      end
    end

    # Empty the buffer.
    def clear
      @mutex.synchronize do
        @buffer = Array.new(@capacity)
        @head = 0
        @size = 0
      end
    end

    # @return [Integer]
    def size
      @mutex.synchronize { @size }
    end
  end
end
