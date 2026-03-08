# frozen_string_literal: true

module Uncaught
  module EnvDetector
    module_function

    # Detect the current runtime environment.
    #
    # @return [EnvironmentInfo]
    def detect
      info = EnvironmentInfo.new

      info.runtime = "ruby"
      info.runtime_version = RUBY_VERSION
      info.platform = RUBY_PLATFORM
      info.os = detect_os

      # Detect framework
      detect_framework(info)

      # Detect hosting platform
      detect_platform(info)

      info
    end

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def detect_os
      case RUBY_PLATFORM
      when /darwin/i
        "macOS"
      when /mswin|mingw|cygwin/i
        "Windows"
      when /linux/i
        "Linux"
      when /freebsd/i
        "FreeBSD"
      else
        RUBY_PLATFORM
      end
    end

    def detect_framework(info)
      # Rails
      if defined?(::Rails)
        info.framework = "Rails"
        info.framework_version = ::Rails::VERSION::STRING if defined?(::Rails::VERSION::STRING)
        return
      end

      # Sinatra
      if defined?(::Sinatra)
        info.framework = "Sinatra"
        info.framework_version = ::Sinatra::VERSION if defined?(::Sinatra::VERSION)
        return
      end

      # Hanami
      if defined?(::Hanami)
        info.framework = "Hanami"
        info.framework_version = ::Hanami::VERSION if defined?(::Hanami::VERSION)
        return
      end

      # Grape
      if defined?(::Grape)
        info.framework = "Grape"
        info.framework_version = ::Grape::VERSION if defined?(::Grape::VERSION)
        return
      end

      # Roda
      if defined?(::Roda)
        info.framework = "Roda"
        return
      end
    end

    def detect_platform(info)
      if ENV["HEROKU_APP_NAME"]
        info.platform = "heroku"
      elsif ENV["VERCEL"]
        info.platform = "vercel"
      elsif ENV["RAILWAY_PROJECT_ID"]
        info.platform = "railway"
      elsif ENV["FLY_APP_NAME"]
        info.platform = "fly"
      elsif ENV["AWS_LAMBDA_FUNCTION_NAME"]
        info.platform = "aws-lambda"
      elsif ENV["GOOGLE_CLOUD_PROJECT"]
        info.platform = "gcp"
      elsif ENV["RENDER_SERVICE_ID"]
        info.platform = "render"
      end
    end

    private_class_method :detect_os, :detect_framework, :detect_platform
  end
end
