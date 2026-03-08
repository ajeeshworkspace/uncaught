# frozen_string_literal: true

module Uncaught
  # Severity levels mirroring syslog.
  SEVERITY_LEVELS = %w[fatal error warning info debug].freeze

  # Breadcrumb categories.
  BREADCRUMB_TYPES = %w[click navigation api_call db_query auth console web_vital custom].freeze

  # Issue statuses.
  ISSUE_STATUSES = %w[open resolved ignored].freeze

  # Transport modes.
  TRANSPORT_MODES = %w[local console].freeze

  # ---------------------------------------------------------------------------
  # Struct definitions
  # ---------------------------------------------------------------------------

  # SDK metadata shipped with every event.
  SdkInfo = Struct.new(:name, :version, keyword_init: true)

  # Contextual HTTP request information attached to an event.
  RequestInfo = Struct.new(:method, :url, :headers, :body, :query, keyword_init: true)

  # Information about a failed external operation (DB, auth, API, etc.).
  OperationInfo = Struct.new(:provider, :type, :method, :params, :error_code, :error_details, keyword_init: true)

  # User context attached to events.
  UserInfo = Struct.new(:id, :email, :username, :session_id, keyword_init: true)

  # Structured representation of a captured error.
  ErrorInfo = Struct.new(:message, :type, :stack, :resolved_stack, :component_stack, keyword_init: true)

  # A single breadcrumb entry.
  Breadcrumb = Struct.new(:type, :category, :message, :timestamp, :data, :level, keyword_init: true)

  # Detected runtime / platform information.
  EnvironmentInfo = Struct.new(
    :framework, :framework_version, :runtime, :runtime_version,
    :platform, :os, :browser, :browser_version, :device_type,
    :locale, :timezone, :url, :deploy,
    keyword_init: true
  )

  # The canonical event payload sent to transports.
  UncaughtEvent = Struct.new(
    :event_id, :timestamp, :project_key, :level, :fingerprint,
    :release, :error, :breadcrumbs, :request, :operation,
    :environment, :user, :user_feedback, :fix_prompt, :sdk,
    keyword_init: true
  )

  # An entry in the issues.json index file.
  IssueEntry = Struct.new(
    :fingerprint, :title, :error_type, :count, :affected_users,
    :first_seen, :last_seen, :status, :fix_prompt_file,
    :latest_event_file, :release, :environment,
    keyword_init: true
  )

  # Configuration object.
  Configuration = Struct.new(
    :project_key, :endpoint, :environment, :release, :debug,
    :enabled, :max_breadcrumbs, :max_events_per_minute,
    :before_send, :sanitize_keys, :ignore_errors,
    :transport, :local_output_dir, :webhook_url,
    :framework, :framework_version,
    keyword_init: true
  ) do
    def initialize(**kwargs)
      super(
        enabled: true,
        debug: false,
        max_breadcrumbs: 20,
        max_events_per_minute: 30,
        transport: "local",
        sanitize_keys: [],
        ignore_errors: [],
        **kwargs
      )
    end
  end
end
