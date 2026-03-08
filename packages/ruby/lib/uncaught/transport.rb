# frozen_string_literal: true

require "json"
require "fileutils"
require "tempfile"

module Uncaught
  # Local file transport that writes events to the .uncaught/ directory.
  #
  # Uses atomic writes via Tempfile + File.rename.
  # Updates issues.json index.
  # Optionally writes to SQLite if the sqlite3 gem is available.
  class LocalFileTransport
    # @param config [Configuration]
    def initialize(config)
      @config = config
      @base_dir = config.local_output_dir || File.join(Dir.pwd, ".uncaught")
      @mutex = Mutex.new
      @initialised = false
    end

    # Send an event to the local file system.
    #
    # @param event [UncaughtEvent]
    def send_event(event)
      ensure_initialised!

      fp = event.fingerprint
      event_dir = File.join(@base_dir, "events", fp)
      FileUtils.mkdir_p(event_dir)

      event_hash = event_to_hash(event)
      event_json = JSON.pretty_generate(event_hash)

      # --- Write timestamped event file (atomic: .tmp -> rename) ----------
      ts = event.timestamp.gsub(/[:.]/,  "-")
      event_file = "event-#{ts}.json"
      event_path = File.join(event_dir, event_file)
      atomic_write(event_path, event_json)

      # --- Write / overwrite latest.json ---------------------------------
      latest_path = File.join(event_dir, "latest.json")
      atomic_write(latest_path, event_json)

      # --- Write fix-prompt Markdown file --------------------------------
      prompt_file = "#{fp}.md"
      prompt_path = File.join(@base_dir, "fix-prompts", prompt_file)
      atomic_write(prompt_path, event.fix_prompt || "")

      # --- Update issues.json index -------------------------------------
      update_issues_index(event, event_file, prompt_file)

      # --- Also write to SQLite -----------------------------------------
      write_to_sqlite(event)
    rescue => e
      # Never crash the host app.
      debug_log("LocalFileTransport#send_event failed: #{e.message}")
    end

    # Flush queued events (no-op for local file transport).
    def flush
      # Local file transport writes synchronously per-event; nothing to flush.
    end

    private

    def ensure_initialised!
      return if @initialised

      @mutex.synchronize do
        return if @initialised

        FileUtils.mkdir_p(File.join(@base_dir, "events"))
        FileUtils.mkdir_p(File.join(@base_dir, "fix-prompts"))
        ensure_gitignore
        @initialised = true
      end
    end

    def ensure_gitignore
      gitignore_path = File.join(Dir.pwd, ".gitignore")
      content = File.exist?(gitignore_path) ? File.read(gitignore_path) : ""
      unless content.include?(".uncaught")
        File.open(gitignore_path, "a") do |f|
          f.write("\n# Uncaught local error store\n.uncaught/\n")
        end
      end
    rescue
      # Non-critical -- swallow.
    end

    # Atomic write via tempfile + rename.
    def atomic_write(path, content)
      tmp_path = "#{path}.tmp"
      File.write(tmp_path, content, encoding: "UTF-8")
      File.rename(tmp_path, path)
    end

    # Read, update, and atomically write the issues.json index.
    def update_issues_index(event, event_file, prompt_file)
      @mutex.synchronize do
        index_path = File.join(@base_dir, "issues.json")

        issues = []
        if File.exist?(index_path)
          begin
            issues = JSON.parse(File.read(index_path))
          rescue
            issues = []
          end
        end

        user_id = event.user&.id || event.user&.email || "anonymous"
        existing = issues.find { |i| i["fingerprint"] == event.fingerprint }

        if existing
          existing["count"] = (existing["count"] || 0) + 1
          existing["lastSeen"] = event.timestamp
          existing["latestEventFile"] = event_file
          existing["fixPromptFile"] = prompt_file
          unless (existing["affectedUsers"] || []).include?(user_id)
            existing["affectedUsers"] = (existing["affectedUsers"] || []) + [user_id]
          end
          # Re-open if previously resolved
          if existing["status"] == "resolved"
            existing["status"] = "open"
          end
        else
          issues << {
            "fingerprint" => event.fingerprint,
            "title" => event.error.message,
            "errorType" => event.error.type,
            "count" => 1,
            "affectedUsers" => [user_id],
            "firstSeen" => event.timestamp,
            "lastSeen" => event.timestamp,
            "status" => "open",
            "fixPromptFile" => prompt_file,
            "latestEventFile" => event_file,
            "release" => event.release,
            "environment" => event.environment&.deploy
          }
        end

        atomic_write(index_path, JSON.pretty_generate(issues))
      end
    end

    # Attempt to write to SQLite (best-effort).
    def write_to_sqlite(event)
      require "sqlite3"
      db_path = File.join(@base_dir, "uncaught.db")
      db = SQLite3::Database.new(db_path)

      db.execute(<<~SQL)
        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          level TEXT NOT NULL,
          error_type TEXT,
          error_message TEXT,
          stack TEXT,
          fix_prompt TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      SQL

      db.execute(<<~SQL, [
        event.event_id, event.timestamp, event.fingerprint, event.level,
        event.error.type, event.error.message, event.error.stack,
        event.fix_prompt
      ])
        INSERT OR REPLACE INTO events
          (event_id, timestamp, fingerprint, level, error_type, error_message, stack, fix_prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      SQL

      db.close
    rescue LoadError
      # sqlite3 gem not available -- skip.
    rescue => e
      debug_log("SQLite write failed: #{e.message}")
    end

    # Convert an UncaughtEvent struct to a JSON-compatible hash using camelCase
    # keys to match the TypeScript SDK output format.
    def event_to_hash(event)
      hash = {
        "eventId" => event.event_id,
        "timestamp" => event.timestamp,
        "level" => event.level,
        "fingerprint" => event.fingerprint,
        "error" => error_to_hash(event.error),
        "breadcrumbs" => (event.breadcrumbs || []).map { |b| breadcrumb_to_hash(b) },
        "fixPrompt" => event.fix_prompt || "",
        "sdk" => sdk_to_hash(event.sdk)
      }

      hash["projectKey"] = event.project_key if event.project_key
      hash["release"] = event.release if event.release
      hash["request"] = request_to_hash(event.request) if event.request
      hash["operation"] = operation_to_hash(event.operation) if event.operation
      hash["environment"] = environment_to_hash(event.environment) if event.environment
      hash["user"] = user_to_hash(event.user) if event.user
      hash["userFeedback"] = event.user_feedback if event.user_feedback

      hash
    end

    def error_to_hash(err)
      return {} unless err

      h = { "message" => err.message, "type" => err.type }
      h["stack"] = err.stack if err.stack
      h["resolvedStack"] = err.resolved_stack if err.resolved_stack
      h["componentStack"] = err.component_stack if err.component_stack
      h
    end

    def breadcrumb_to_hash(b)
      return {} unless b

      h = {
        "type" => b.type,
        "category" => b.category,
        "message" => b.message,
        "timestamp" => b.timestamp
      }
      h["data"] = b.data if b.data
      h["level"] = b.level if b.level
      h
    end

    def sdk_to_hash(sdk)
      return {} unless sdk

      { "name" => sdk.name, "version" => sdk.version }
    end

    def request_to_hash(req)
      return nil unless req

      h = {}
      h["method"] = req.method if req.method
      h["url"] = req.url if req.url
      h["headers"] = req.headers if req.headers
      h["body"] = req.body if req.body
      h["query"] = req.query if req.query
      h
    end

    def operation_to_hash(op)
      return nil unless op

      h = {}
      h["provider"] = op.provider if op.provider
      h["type"] = op.type if op.type
      h["method"] = op.method if op.method
      h["params"] = op.params if op.params
      h["errorCode"] = op.error_code if op.error_code
      h["errorDetails"] = op.error_details if op.error_details
      h
    end

    def environment_to_hash(env)
      return nil unless env

      h = {}
      h["framework"] = env.framework if env.framework
      h["frameworkVersion"] = env.framework_version if env.framework_version
      h["runtime"] = env.runtime if env.runtime
      h["runtimeVersion"] = env.runtime_version if env.runtime_version
      h["platform"] = env.platform if env.platform
      h["os"] = env.os if env.os
      h["browser"] = env.browser if env.browser
      h["browserVersion"] = env.browser_version if env.browser_version
      h["deviceType"] = env.device_type if env.device_type
      h["locale"] = env.locale if env.locale
      h["timezone"] = env.timezone if env.timezone
      h["url"] = env.url if env.url
      h["deploy"] = env.deploy if env.deploy
      h
    end

    def user_to_hash(usr)
      return nil unless usr

      h = {}
      h["id"] = usr.id if usr.id
      h["email"] = usr.email if usr.email
      h["username"] = usr.username if usr.username
      h["sessionId"] = usr.session_id if usr.session_id
      h
    end

    def debug_log(msg)
      $stderr.puts("[uncaught] #{msg}") if @config&.debug
    end
  end

  # Console transport for development/debugging.
  class ConsoleTransport
    def initialize(config)
      @config = config
    end

    def send_event(event)
      title = "[uncaught] #{event.error.type}: #{event.error.message}"
      $stderr.puts("--- #{title} ---")
      $stderr.puts("Error: #{event.error.message}")
      $stderr.puts("Stack: #{event.error.stack}") if event.error.stack
      $stderr.puts("Event ID: #{event.event_id}")
      $stderr.puts("Fingerprint: #{event.fingerprint}")
      $stderr.puts("Breadcrumbs: #{event.breadcrumbs.inspect}")
      $stderr.puts("Fix Prompt:\n#{event.fix_prompt}") if event.fix_prompt && !event.fix_prompt.empty?
      $stderr.puts("---")
    rescue
      # Never throw from transport.
    end

    def flush
      # Nothing to flush for console transport.
    end
  end

  # Factory method to create the appropriate transport.
  #
  # @param config [Configuration]
  # @return [LocalFileTransport, ConsoleTransport]
  def self.create_transport(config)
    mode = config.transport || "local"
    case mode
    when "console"
      ConsoleTransport.new(config)
    else
      LocalFileTransport.new(config)
    end
  end
end
