# frozen_string_literal: true

require "set"
require "json"
require "time"

require_relative "uncaught/version"
require_relative "uncaught/types"
require_relative "uncaught/fingerprint"
require_relative "uncaught/breadcrumbs"
require_relative "uncaught/rate_limiter"
require_relative "uncaught/sanitizer"
require_relative "uncaught/env_detector"
require_relative "uncaught/prompt_builder"
require_relative "uncaught/transport"
require_relative "uncaught/client"

module Uncaught
  class Error < StandardError; end

  # Module-level singleton client.
  @client = nil
  @config = nil
  @mutex = Mutex.new

  class << self
    # Configure the Uncaught SDK.
    #
    # @yield [Configuration] Yields the configuration object for modification.
    # @return [Client] The configured client instance.
    #
    # @example
    #   Uncaught.configure do |config|
    #     config.project_key = "my-project"
    #     config.environment = "production"
    #     config.release = "1.0.0"
    #   end
    def configure
      @mutex.synchronize do
        @config ||= Configuration.new
        yield @config if block_given?
        @client = Client.new(@config)
      end
      @client
    end

    # Return the current singleton client, or nil if not configured.
    #
    # @return [Client, nil]
    def client
      @client
    end

    # Return the current configuration, or nil if not configured.
    #
    # @return [Configuration, nil]
    def configuration
      @config
    end

    # Convenience: capture an error on the singleton client.
    #
    # @param error [Exception, String, Hash]
    # @param kwargs [Hash] Additional context (request:, operation:, level:, etc.)
    # @return [String, nil] The event ID.
    def capture_error(error, **kwargs)
      return nil unless @client

      @client.capture_error(error, **kwargs)
    end

    # Convenience: capture a message on the singleton client.
    #
    # @param message [String]
    # @param level   [String]
    # @return [String, nil]
    def capture_message(message, level: "info")
      return nil unless @client

      @client.capture_message(message, level: level)
    end

    # Convenience: add a breadcrumb on the singleton client.
    def add_breadcrumb(**kwargs)
      return unless @client

      @client.add_breadcrumb(**kwargs)
    end

    # Convenience: set user on the singleton client.
    def set_user(user)
      return unless @client

      @client.set_user(user)
    end

    # Convenience: flush on the singleton client.
    def flush
      return unless @client

      @client.flush
    end

    # Install global exception handler for at_exit.
    #
    # @example
    #   Uncaught.install_at_exit_handler!
    def install_at_exit_handler!
      at_exit do
        if $! && !$!.is_a?(SystemExit)
          Uncaught.capture_error($!)
          Uncaught.flush
        end
      end
    end
  end
end

# Auto-load Rails integration if Rails is present.
if defined?(::Rails::Railtie)
  require_relative "uncaught/integrations/rails"
end
