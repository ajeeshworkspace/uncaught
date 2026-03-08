# frozen_string_literal: true

module Uncaught
  if defined?(::Rails::Railtie)
    class Railtie < ::Rails::Railtie
      initializer "uncaught.configure" do |app|
        app.middleware.use Uncaught::Middleware
      end

      config.after_initialize do
        Uncaught.configure do |c|
          c.environment = Rails.env
          c.framework = "Rails"
          c.framework_version = Rails::VERSION::STRING
        end
      end
    end
  end

  # Rack middleware for Rails / Rack applications.
  #
  # - Adds an HTTP breadcrumb for every request.
  # - Captures unhandled exceptions and re-raises them.
  class Middleware
    def initialize(app)
      @app = app
      @client = Uncaught.client
    end

    def call(env)
      # Refresh client reference in case it was reconfigured.
      @client = Uncaught.client if @client.nil?

      if @client
        @client.add_breadcrumb(
          type: "api_call",
          category: "http",
          message: "#{env['REQUEST_METHOD']} #{env['PATH_INFO']}"
        )
      end

      @app.call(env)
    rescue => e
      if @client
        request_info = RequestInfo.new(
          method: env["REQUEST_METHOD"],
          url: env["REQUEST_URI"] || env["PATH_INFO"]
        )
        @client.capture_error(e, request: request_info)
      end
      raise
    end
  end
end
