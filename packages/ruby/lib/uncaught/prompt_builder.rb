# frozen_string_literal: true

module Uncaught
  module PromptBuilder
    module_function

    # Build a structured Markdown prompt that can be pasted into an AI assistant
    # to diagnose and fix the production error described by the event.
    #
    # Empty sections are omitted to keep the prompt concise.
    #
    # @param event [UncaughtEvent]
    # @return [String]
    def build(event)
      sections = []

      # ----- Intro -----------------------------------------------------------
      sections << "I have a production bug in my application that I need help diagnosing and fixing.\n"

      # ----- Error -----------------------------------------------------------
      if event.error
        location = extract_location(event.error.stack)
        lines = ["## Error", ""]
        lines << "- **Type:** #{event.error.type || 'Error'}"
        lines << "- **Message:** #{event.error.message || '(no message)'}"
        lines << "- **Location:** #{location}" if location
        sections << lines.join("\n")
      end

      # ----- Stack Trace -----------------------------------------------------
      stack_source = event.error&.resolved_stack || event.error&.stack
      if stack_source && !stack_source.empty?
        frames = stack_source.split("\n").first(15).map(&:rstrip).join("\n")
        label = event.error&.resolved_stack ? "Stack Trace (source-mapped)" : "Stack Trace"
        sections << "## #{label}\n\n```\n#{frames}\n```"
      end

      # ----- Failed Operation ------------------------------------------------
      if event.operation
        sections << format_operation(event.operation)
      end

      # ----- HTTP Request Context --------------------------------------------
      if event.request
        sections << format_request(event.request)
      end

      # ----- User Session (last 5 breadcrumbs) -------------------------------
      if event.breadcrumbs && !event.breadcrumbs.empty?
        sections << format_breadcrumbs(event.breadcrumbs)
      end

      # ----- Environment -----------------------------------------------------
      if event.environment
        sections << format_environment(event.environment)
      end

      # ----- Component Stack -------------------------------------------------
      if event.error&.component_stack && !event.error.component_stack.empty?
        sections << "## React Component Stack\n\n```\n#{event.error.component_stack.strip}\n```"
      end

      # ----- What I need -----------------------------------------------------
      sections << [
        "## What I need",
        "",
        "1. **Root cause analysis** -- explain why this error is occurring.",
        "2. **A fix** -- provide the corrected code with an explanation of the changes.",
        "3. **Prevention** -- suggest any guards or tests to prevent this from happening again."
      ].join("\n")

      sections.join("\n\n") + "\n"
    end

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    # Extract the top-most location (file:line:col) from a stack trace string.
    def extract_location(stack)
      return nil unless stack

      stack.split("\n").each do |line|
        trimmed = line.strip

        # V8: "    at fn (file:line:col)"
        v8 = trimmed.match(/at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?/)
        return v8[1] if v8

        # SpiderMonkey / JSC: "fn@file:line:col"
        sm = trimmed.match(/@(.+?:\d+:\d+)/)
        return sm[1] if sm

        # Ruby: "/path/to/file.rb:42:in `method'"
        rb = trimmed.match(%r{(.+?:\d+):in\s+})
        return rb[1] if rb
      end

      nil
    end

    def format_operation(op)
      lines = ["## Failed Operation", ""]
      lines << "- **Provider:** #{op.provider}"
      lines << "- **Type:** #{op.type}"
      lines << "- **Method:** #{op.method}"
      if op.params
        lines << "- **Params:**"
        lines << "```json"
        lines << JSON.pretty_generate(op.params)
        lines << "```"
      end
      lines << "- **Error Code:** #{op.error_code}" if op.error_code
      lines << "- **Error Details:** #{op.error_details}" if op.error_details
      lines.join("\n")
    end

    def format_request(req)
      lines = ["## HTTP Request Context", ""]
      lines << "- **Method:** #{req.method}" if req.method
      lines << "- **URL:** #{req.url}" if req.url
      if req.body
        lines << "- **Body:**"
        lines << "```json"
        lines << (req.body.is_a?(String) ? req.body : JSON.pretty_generate(req.body))
        lines << "```"
      end
      lines.join("\n")
    end

    def format_breadcrumbs(crumbs)
      recent = crumbs.last(5)
      lines = ["## User Session", ""]
      recent.each do |crumb|
        time = format_time(crumb.timestamp)
        lines << "- `#{time}` **[#{crumb.type}]** #{crumb.message}"
      end
      lines.join("\n")
    end

    # Extract HH:MM:SS from an ISO timestamp.
    def format_time(iso)
      t = Time.parse(iso)
      t.strftime("%H:%M:%S")
    rescue
      iso.to_s
    end

    def format_environment(env)
      lines = ["## Environment", ""]
      entries = [
        ["Deploy Environment", env.deploy],
        ["Framework", env.framework],
        ["Framework Version", env.framework_version],
        ["Runtime", env.runtime],
        ["Runtime Version", env.runtime_version],
        ["Platform", env.platform],
        ["Browser", env.browser ? "#{env.browser} #{env.browser_version}".strip : nil],
        ["OS", env.os],
        ["Device", env.device_type],
        ["Locale", env.locale],
        ["Timezone", env.timezone],
        ["URL", env.url]
      ]
      entries.each do |label, value|
        lines << "- **#{label}:** #{value}" if value && !value.to_s.empty?
      end
      lines.join("\n")
    end

    private_class_method :extract_location, :format_operation, :format_request,
                         :format_breadcrumbs, :format_time, :format_environment
  end
end
