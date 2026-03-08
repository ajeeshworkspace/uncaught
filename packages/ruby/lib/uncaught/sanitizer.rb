# frozen_string_literal: true

module Uncaught
  module Sanitizer
    # Default key patterns that are always redacted.
    DEFAULT_SENSITIVE_KEYS = %w[
      password passwd secret token apikey api_key authorization
      credit_card creditcard card_number cvv ssn social_security
      private_key access_token refresh_token session_id cookie
    ].freeze

    # Headers that are always stripped regardless of key matching.
    SENSITIVE_HEADERS = Set.new(%w[authorization cookie set-cookie]).freeze

    REDACTED = "[REDACTED]"
    MAX_STRING_LENGTH = 2048

    module_function

    # Deep-clone and sanitise obj, redacting values whose keys match
    # sensitive patterns.
    #
    # - Handles circular references (returns "[Circular]").
    # - Truncates strings longer than 2048 characters.
    # - Never mutates the original object.
    #
    # @param obj             [Object]  The value to sanitise.
    # @param additional_keys [Array<String>] Extra key patterns to redact.
    # @return [Object]
    def sanitize(obj, additional_keys = [])
      pattern = build_key_pattern(additional_keys)
      seen = Set.new
      walk(obj, pattern, seen, nil)
    end

    # Build a single Regexp that matches any of the sensitive key patterns
    # (case-insensitive).
    def build_key_pattern(additional_keys = [])
      all_keys = DEFAULT_SENSITIVE_KEYS + (additional_keys || [])
      escaped = all_keys.map { |k| Regexp.escape(k) }
      Regexp.new(escaped.join("|"), Regexp::IGNORECASE)
    end

    def walk(value, pattern, seen, key)
      # Redact if the current key is sensitive
      if key && pattern.match?(key.to_s)
        return REDACTED
      end

      case value
      when nil
        nil
      when String
        if value.length > MAX_STRING_LENGTH
          value[0, MAX_STRING_LENGTH] + "...[truncated]"
        else
          value.dup
        end
      when Integer, Float, TrueClass, FalseClass
        value
      when Symbol
        value.to_s
      when Time, DateTime
        value.iso8601(3)
      when Array
        obj_id = value.object_id
        return "[Circular]" if seen.include?(obj_id)

        seen.add(obj_id)
        result = value.map { |item| walk(item, pattern, seen, nil) }
        seen.delete(obj_id)
        result
      when Hash
        obj_id = value.object_id
        return "[Circular]" if seen.include?(obj_id)

        seen.add(obj_id)
        result = {}
        value.each do |k, v|
          str_key = k.to_s
          # Always strip sensitive headers
          if SENSITIVE_HEADERS.include?(str_key.downcase)
            result[k] = REDACTED
          else
            result[k] = walk(v, pattern, seen, str_key)
          end
        end
        seen.delete(obj_id)
        result
      when Struct
        obj_id = value.object_id
        return "[Circular]" if seen.include?(obj_id)

        seen.add(obj_id)
        result = value.class.new
        value.members.each do |member|
          member_val = value[member]
          sanitized = walk(member_val, pattern, seen, member.to_s)
          result[member] = sanitized
        end
        seen.delete(obj_id)
        result
      else
        # For other objects, try to convert to string
        value.to_s
      end
    end

    private_class_method :build_key_pattern, :walk
  end
end
