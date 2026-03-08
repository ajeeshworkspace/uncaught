# frozen_string_literal: true

module Uncaught
  # Sliding-window rate limiter.
  #
  # Enforces:
  #   - A global maximum of events per 60-second window.
  #   - A per-fingerprint maximum of events per 60-second window.
  #
  # Thread-safe via Mutex.
  class RateLimiter
    # Window duration in seconds.
    WINDOW_SECONDS = 60

    # @param global_max          [Integer] Max events across all fingerprints. Defaults to 30.
    # @param per_fingerprint_max [Integer] Max events for a single fingerprint. Defaults to 5.
    def initialize(global_max: 30, per_fingerprint_max: 5)
      @global_max = global_max
      @per_fingerprint_max = per_fingerprint_max
      @global_timestamps = []
      @buckets = {}
      @mutex = Mutex.new
    end

    # Returns true if the event identified by fingerprint is allowed through,
    # false if it should be dropped.
    #
    # @param fingerprint [String]
    # @return [Boolean]
    def should_allow?(fingerprint)
      @mutex.synchronize do
        now = Time.now.to_f

        # --- Global limit ---
        prune!(@global_timestamps, now)
        return false if @global_timestamps.size >= @global_max

        # --- Per-fingerprint limit ---
        @buckets[fingerprint] ||= []
        fp_timestamps = @buckets[fingerprint]
        prune!(fp_timestamps, now)
        return false if fp_timestamps.size >= @per_fingerprint_max

        # Record this event
        @global_timestamps << now
        fp_timestamps << now

        # Periodic cleanup: remove empty buckets
        if @buckets.size > 1000
          @buckets.delete_if { |_k, v| v.empty? }
        end

        true
      end
    end

    private

    # Remove timestamps older than the sliding window from an array (in-place).
    def prune!(timestamps, now)
      cutoff = now - WINDOW_SECONDS
      timestamps.shift while timestamps.any? && timestamps.first <= cutoff
    end
  end
end
