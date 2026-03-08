# frozen_string_literal: true

module Uncaught
  module Fingerprint
    module_function

    # Generate a stable fingerprint for an error so that duplicate occurrences
    # of the same bug are grouped together.
    #
    # The fingerprint is an 8-character hex string derived from:
    #   1. The error type (or "Error" if absent).
    #   2. The normalised error message (volatile parts stripped).
    #   3. The top 3 stack frames (file + function name, no line/col numbers).
    #
    # @param type    [String, nil] Error class name.
    # @param message [String, nil] Error message.
    # @param stack   [String, nil] Stack trace string.
    # @return [String] 8-character lowercase hex fingerprint.
    def generate(type: nil, message: nil, stack: nil)
      normalised_message = normalise_message(message || "")
      frames = extract_top_frames(stack || "", 3)
      input = [type || "Error", normalised_message, *frames].join("\n")
      djb2(input)
    end

    # -------------------------------------------------------------------------
    # DJB2 hash -> 8-character lowercase hex string.
    #
    # Matches the TypeScript implementation exactly:
    #   let hash = 5381;
    #   hash = ((hash << 5) + hash + charCode) | 0;   // signed 32-bit
    #   return (hash >>> 0).toString(16).padStart(8, '0');
    #
    # Ruby integers are arbitrary precision, so we must mask to 32 bits after
    # every operation to emulate JavaScript's `| 0` (signed 32-bit) and
    # `>>> 0` (unsigned 32-bit) semantics.
    # -------------------------------------------------------------------------
    def djb2(str)
      hash = 5381
      # JavaScript's charCodeAt() returns UTF-16 code units, not UTF-8 bytes.
      # For BMP characters (U+0000..U+FFFF), the code unit equals the code point.
      # For characters above U+FFFF, JavaScript uses surrogate pairs (two 16-bit
      # code units). We replicate this by encoding to UTF-16LE and reading pairs.
      utf16_bytes = str.encode("UTF-16LE").bytes
      i = 0
      while i < utf16_bytes.length
        # Read a 16-bit little-endian code unit (matches JS charCodeAt)
        code_unit = utf16_bytes[i] | (utf16_bytes[i + 1] << 8)
        # hash * 33 + code_unit, then truncate to signed 32-bit via `| 0`
        hash = (((hash << 5) + hash) + code_unit) & 0xFFFFFFFF
        hash = to_signed32(hash)
        i += 2
      end
      # Emulate JavaScript `>>> 0` (convert to unsigned 32-bit)
      unsigned = hash & 0xFFFFFFFF
      unsigned.to_s(16).rjust(8, "0")
    end

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    # Strip volatile substrings from an error message so that trivially-different
    # occurrences of the same bug hash identically.
    def normalise_message(msg)
      result = msg.dup
      # UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      result.gsub!(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "<UUID>")
      # Hex strings (8+ hex chars in a row, word-bounded)
      result.gsub!(/\b[0-9a-f]{8,}\b/i, "<HEX>")
      # Numbers longer than 3 digits
      result.gsub!(/\b\d{4,}\b/, "<NUM>")
      # ISO timestamps
      result.gsub!(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/, "<TIMESTAMP>")
      # Hashed file paths
      result.gsub!(%r{([/\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\.(js|ts|mjs|cjs|jsx|tsx)}, '\1<FILE>.\3')
      result.strip
    end

    # Extract the top N stack frames as normalised "file:function" strings.
    # Supports V8, SpiderMonkey, and Ruby stack trace formats.
    def extract_top_frames(stack, count)
      return [] if stack.nil? || stack.empty?

      frames = []
      stack.split("\n").each do |line|
        break if frames.size >= count

        trimmed = line.strip

        # V8 format: "    at FunctionName (file:line:col)"
        # or         "    at file:line:col"
        if (v8_match = trimmed.match(/at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?/))
          fn = v8_match[1] || "<anonymous>"
          file = normalise_path(v8_match[2] || "<unknown>")
          frames << "#{file}:#{fn}"
          next
        end

        # SpiderMonkey / JavaScriptCore: "functionName@file:line:col"
        if (sm_match = trimmed.match(/^(.+?)@(.+?):\d+:\d+/))
          fn = sm_match[1] || "<anonymous>"
          file = normalise_path(sm_match[2] || "<unknown>")
          frames << "#{file}:#{fn}"
          next
        end

        # Ruby format: "/path/to/file.rb:42:in `method_name'"
        if (rb_match = trimmed.match(%r{(.+?):(\d+):in\s+[`'](.+?)'}))
          file = normalise_path(rb_match[1])
          fn = rb_match[3]
          frames << "#{file}:#{fn}"
          next
        end
      end

      frames
    end

    # Normalise a file path by stripping query strings / hashes and collapsing
    # absolute filesystem prefixes.
    def normalise_path(path)
      result = path.dup
      # Strip query / hash
      result.sub!(/[?#].*$/, "")
      # Collapse node_modules deep paths
      result.sub!(/^.*\/node_modules\//, "node_modules/")
      # Strip origin in URLs
      result.sub!(%r{^https?://[^/]+}, "")
      # Keep only filename
      result.sub!(%r{^.*[/\\]}, "")
      result
    end

    # Convert unsigned 32-bit integer to signed 32-bit integer
    # (emulating JavaScript's `| 0` operator).
    def to_signed32(val)
      val = val & 0xFFFFFFFF
      val >= 0x80000000 ? val - 0x100000000 : val
    end

    private_class_method :normalise_message, :extract_top_frames, :normalise_path, :to_signed32
  end
end
