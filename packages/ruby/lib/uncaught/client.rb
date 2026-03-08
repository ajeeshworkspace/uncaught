# frozen_string_literal: true

require "securerandom"
require "time"

module Uncaught
  SDK_NAME = "uncaught-ruby"

  # The main SDK client. Captures errors and sends them through the transport
  # pipeline.
  class Client
    attr_reader :config

    # @param config [Configuration]
    def initialize(config)
      @config = config
      @breadcrumbs = BreadcrumbStore.new(config.max_breadcrumbs || 20)
      @transport = Uncaught.create_transport(config)
      @rate_limiter = RateLimiter.new(
        global_max: config.max_events_per_minute || 30
      )
      @session_id = SecureRandom.uuid
      @seen_fingerprints = Set.new
      @user = nil
      @mutex = Mutex.new
    end

    # Capture an error and send it through the transport pipeline.
    #
    # @param error   [Exception, String, Hash] The error to capture.
    # @param request [RequestInfo, nil]
    # @param operation [OperationInfo, nil]
    # @param component_stack [String, nil]
    # @param level [String] Severity level. Defaults to "error".
    # @return [String, nil] The event ID, or nil if the event was dropped.
    def capture_error(error, request: nil, operation: nil, component_stack: nil, level: "error")
      return nil unless @config.enabled

      # --- Normalise error ---
      error_info = normalise_error(error)
      error_info.component_stack = component_stack if component_stack

      # --- Check ignoreErrors ---
      if should_ignore?(error_info.message)
        debug_log("Event ignored by ignoreErrors filter")
        return nil
      end

      # --- Fingerprint ---
      fingerprint = Fingerprint.generate(
        type: error_info.type,
        message: error_info.message,
        stack: error_info.stack
      )

      # --- Rate limit ---
      unless @rate_limiter.should_allow?(fingerprint)
        debug_log("Rate-limited: #{fingerprint}")
        return nil
      end

      # --- Collect breadcrumbs ---
      crumbs = @breadcrumbs.get_all

      # --- Detect environment ---
      environment = EnvDetector.detect

      # Attach deployment environment from config
      environment.deploy = @config.environment if @config.environment
      environment.framework = @config.framework if @config.framework
      environment.framework_version = @config.framework_version if @config.framework_version

      # --- Build event ---
      event_id = SecureRandom.uuid
      event = UncaughtEvent.new(
        event_id: event_id,
        timestamp: Time.now.utc.iso8601(3),
        project_key: @config.project_key,
        level: level,
        fingerprint: fingerprint,
        release: @config.release,
        error: error_info,
        breadcrumbs: crumbs,
        request: request,
        operation: operation,
        environment: environment,
        user: build_user_info,
        fix_prompt: "",
        sdk: SdkInfo.new(name: SDK_NAME, version: VERSION)
      )

      # --- Sanitise ---
      event = Sanitizer.sanitize(event, @config.sanitize_keys)

      # --- Build fix prompt ---
      event.fix_prompt = PromptBuilder.build(event)

      # --- beforeSend hook ---
      if @config.before_send
        result = @config.before_send.call(event)
        if result.nil?
          debug_log("Event dropped by beforeSend")
          return nil
        end
        event = result
      end

      # --- Send ---
      @transport.send_event(event)
      debug_log("Captured event: #{event_id} (#{fingerprint})")

      # --- Track seen fingerprints ---
      @mutex.synchronize do
        @seen_fingerprints.add(fingerprint)
      end

      event_id
    rescue => e
      debug_log("capture_error failed: #{e.message}")
      nil
    end

    # Capture a plain message (not backed by an Exception instance).
    #
    # @param message [String]
    # @param level   [String] Defaults to "info".
    # @return [String, nil] The event ID, or nil if the event was dropped.
    def capture_message(message, level: "info")
      capture_error(RuntimeError.new(message), level: level)
    rescue => e
      debug_log("capture_message failed: #{e.message}")
      nil
    end

    # Add a breadcrumb to the ring buffer.
    #
    # @param type     [String]
    # @param category [String]
    # @param message  [String]
    # @param data     [Hash, nil]
    # @param level    [String, nil]
    def add_breadcrumb(type:, category:, message:, data: nil, level: nil)
      return unless @config.enabled

      @breadcrumbs.add(
        type: type,
        category: category,
        message: message,
        data: data,
        level: level
      )
    rescue => e
      debug_log("add_breadcrumb failed: #{e.message}")
    end

    # Set user context that will be attached to subsequent events.
    #
    # @param user [UserInfo, Hash, nil]
    def set_user(user)
      @mutex.synchronize do
        if user.nil?
          @user = nil
        elsif user.is_a?(UserInfo)
          @user = user.dup
        elsif user.is_a?(Hash)
          @user = UserInfo.new(
            id: user[:id] || user["id"],
            email: user[:email] || user["email"],
            username: user[:username] || user["username"]
          )
        end
      end
    rescue => e
      debug_log("set_user failed: #{e.message}")
    end

    # Flush all queued events to the transport.
    def flush
      @transport.flush
    rescue => e
      debug_log("flush failed: #{e.message}")
    end

    private

    def normalise_error(error)
      case error
      when Exception
        ErrorInfo.new(
          message: error.message || error.to_s,
          type: error.class.name || "Error",
          stack: (error.backtrace || []).join("\n")
        )
      when String
        ErrorInfo.new(
          message: error,
          type: "StringError",
          stack: caller.join("\n")
        )
      when Hash
        ErrorInfo.new(
          message: (error[:message] || error["message"] || error.to_s).to_s,
          type: (error[:type] || error["type"] || "HashError").to_s,
          stack: (error[:stack] || error["stack"] || "").to_s
        )
      else
        ErrorInfo.new(
          message: error.to_s,
          type: "UnknownError"
        )
      end
    end

    def should_ignore?(message)
      return false unless @config.ignore_errors && !@config.ignore_errors.empty?

      @config.ignore_errors.any? do |pattern|
        case pattern
        when String
          message.include?(pattern)
        when Regexp
          pattern.match?(message)
        else
          false
        end
      end
    end

    def build_user_info
      @mutex.synchronize do
        if @user
          UserInfo.new(
            id: @user.id,
            email: @user.email,
            username: @user.username,
            session_id: @session_id
          )
        else
          UserInfo.new(session_id: @session_id)
        end
      end
    end

    def debug_log(msg)
      $stderr.puts("[uncaught] #{msg}") if @config.debug
    end
  end
end
