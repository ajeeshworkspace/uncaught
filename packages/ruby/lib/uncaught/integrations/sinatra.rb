# frozen_string_literal: true

module Uncaught
  # Sinatra extension for Uncaught error monitoring.
  #
  # Usage in a Sinatra app:
  #
  #   require "uncaught"
  #   require "uncaught/integrations/sinatra"
  #
  #   class MyApp < Sinatra::Base
  #     register Uncaught::Sinatra
  #   end
  #
  # Or in a modular app:
  #
  #   Sinatra::Application.register Uncaught::Sinatra
  #
  module SinatraIntegration
    def self.registered(app)
      # Configure Uncaught for Sinatra
      Uncaught.configure do |c|
        c.framework = "Sinatra"
        c.framework_version = ::Sinatra::VERSION if defined?(::Sinatra::VERSION)
      end

      # Add before filter for breadcrumbs
      app.before do
        client = Uncaught.client
        if client
          client.add_breadcrumb(
            type: "api_call",
            category: "http",
            message: "#{request.request_method} #{request.path_info}"
          )
        end
      end

      # Add error handler
      app.error do
        client = Uncaught.client
        error = env["sinatra.error"]

        if client && error
          request_info = Uncaught::RequestInfo.new(
            method: request.request_method,
            url: request.url
          )
          client.capture_error(error, request: request_info)
        end
      end
    end
  end

  # Alias for convenient registration: `register Uncaught::Sinatra`
  Sinatra = SinatraIntegration
end
