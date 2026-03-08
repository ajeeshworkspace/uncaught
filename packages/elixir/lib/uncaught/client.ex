defmodule Uncaught.Client do
  @moduledoc """
  GenServer-based client for the Uncaught SDK.
  Manages configuration, rate limiting, and event dispatch.
  """

  use GenServer

  @sdk_name "uncaught-elixir"
  @sdk_version "0.1.0"
  @window_ms 60_000
  @per_fingerprint_max 5

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc """
  Capture an exception with its stacktrace.
  """
  def capture_exception(exception, stacktrace \\ [], context \\ %{}) do
    GenServer.call(__MODULE__, {:capture_exception, exception, stacktrace, context})
  end

  @doc """
  Capture a plain message.
  """
  def capture_message(message, level \\ :error) do
    GenServer.call(__MODULE__, {:capture_message, message, level})
  end

  @doc """
  Add a breadcrumb.
  """
  def add_breadcrumb(type, category, message, data \\ nil, level \\ nil) do
    GenServer.cast(__MODULE__, {:add_breadcrumb, type, category, message, data, level})
  end

  @doc """
  Set user context.
  """
  def set_user(user) do
    GenServer.cast(__MODULE__, {:set_user, user})
  end

  @doc """
  Flush all queued events.
  """
  def flush do
    GenServer.call(__MODULE__, :flush)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl true
  def init(:ok) do
    config = %{
      project_key: Application.get_env(:uncaught, :project_key),
      endpoint: Application.get_env(:uncaught, :endpoint),
      environment: Application.get_env(:uncaught, :environment),
      release: Application.get_env(:uncaught, :release),
      debug: Application.get_env(:uncaught, :debug, false),
      enabled: Application.get_env(:uncaught, :enabled, true),
      max_breadcrumbs: Application.get_env(:uncaught, :max_breadcrumbs, 20),
      max_events_per_minute: Application.get_env(:uncaught, :max_events_per_minute, 30),
      sanitize_keys: Application.get_env(:uncaught, :sanitize_keys, []),
      ignore_errors: Application.get_env(:uncaught, :ignore_errors, []),
      transport: Application.get_env(:uncaught, :transport, :local),
      local_output_dir: Application.get_env(:uncaught, :local_output_dir)
    }

    state = %{
      config: config,
      session_id: generate_uuid(),
      seen_fingerprints: MapSet.new(),
      user: nil,
      global_timestamps: [],
      fp_timestamps: %{}
    }

    {:ok, state}
  end

  @impl true
  def handle_call({:capture_exception, exception, stacktrace, context}, _from, state) do
    if not state.config.enabled do
      {:reply, :error, state}
    else
      {result, new_state} = do_capture_exception(exception, stacktrace, context, state)
      {:reply, result, new_state}
    end
  end

  @impl true
  def handle_call({:capture_message, message, level}, _from, state) do
    if not state.config.enabled do
      {:reply, :error, state}
    else
      {result, new_state} = do_capture_message(message, level, state)
      {:reply, result, new_state}
    end
  end

  @impl true
  def handle_call(:flush, _from, state) do
    {:reply, :ok, state}
  end

  @impl true
  def handle_cast({:add_breadcrumb, type, category, message, data, level}, state) do
    if state.config.enabled do
      Uncaught.BreadcrumbStore.add(%{
        type: type,
        category: category,
        message: message,
        data: data,
        level: level,
        timestamp: iso_timestamp()
      })
    end

    {:noreply, state}
  end

  @impl true
  def handle_cast({:set_user, user}, state) do
    {:noreply, %{state | user: user}}
  end

  # ---------------------------------------------------------------------------
  # Internal
  # ---------------------------------------------------------------------------

  defp do_capture_exception(exception, stacktrace, context, state) do
    error_info = normalise_exception(exception, stacktrace)

    # Check ignore_errors
    if should_ignore?(error_info.message, state.config.ignore_errors) do
      debug_log(state, "Event ignored by ignore_errors filter")
      {:error, state}
    else
      # Generate fingerprint
      fingerprint =
        Uncaught.Fingerprint.generate(
          error_info.type,
          error_info.message,
          error_info.stack
        )

      # Rate limit
      {allowed?, new_state} = rate_limit_check(fingerprint, state)

      if not allowed? do
        debug_log(state, "Rate-limited: #{fingerprint}")
        {:error, new_state}
      else
        # Collect breadcrumbs
        crumbs = Uncaught.BreadcrumbStore.get_all()

        # Build environment
        environment = detect_environment(state.config)

        # Build user info
        user =
          case state.user do
            nil -> %{session_id: state.session_id}
            u -> Map.put(u, :session_id, state.session_id)
          end

        # Build event
        event_id = generate_uuid()
        level = Map.get(context, :level, :error)

        event = %{
          eventId: event_id,
          timestamp: iso_timestamp(),
          projectKey: state.config.project_key,
          level: to_string(level),
          fingerprint: fingerprint,
          release: state.config.release,
          error: %{
            message: error_info.message,
            type: error_info.type,
            stack: error_info.stack
          },
          breadcrumbs: crumbs,
          request: Map.get(context, :request),
          operation: Map.get(context, :operation),
          environment: environment,
          user: user,
          userFeedback: nil,
          fixPrompt: "",
          sdk: %{name: @sdk_name, version: @sdk_version}
        }

        # Build fix prompt
        event = Map.put(event, :fixPrompt, Uncaught.PromptBuilder.build(event))

        # Send
        Uncaught.Transport.send(event, state.config)
        debug_log(state, "Captured event: #{event_id} (#{fingerprint})")

        new_state = %{
          new_state
          | seen_fingerprints: MapSet.put(new_state.seen_fingerprints, fingerprint)
        }

        {{:ok, event_id}, new_state}
      end
    end
  end

  defp do_capture_message(message, level, state) do
    error_info = %{
      message: message,
      type: "Message",
      stack: nil
    }

    fingerprint = Uncaught.Fingerprint.generate("Message", message, nil)

    {allowed?, new_state} = rate_limit_check(fingerprint, state)

    if not allowed? do
      {:error, new_state}
    else
      crumbs = Uncaught.BreadcrumbStore.get_all()
      environment = detect_environment(state.config)
      event_id = generate_uuid()

      event = %{
        eventId: event_id,
        timestamp: iso_timestamp(),
        projectKey: state.config.project_key,
        level: to_string(level),
        fingerprint: fingerprint,
        release: state.config.release,
        error: error_info,
        breadcrumbs: crumbs,
        request: nil,
        operation: nil,
        environment: environment,
        user: %{session_id: state.session_id},
        userFeedback: nil,
        fixPrompt: "",
        sdk: %{name: @sdk_name, version: @sdk_version}
      }

      event = Map.put(event, :fixPrompt, Uncaught.PromptBuilder.build(event))
      Uncaught.Transport.send(event, state.config)

      new_state = %{
        new_state
        | seen_fingerprints: MapSet.put(new_state.seen_fingerprints, fingerprint)
      }

      {{:ok, event_id}, new_state}
    end
  end

  defp normalise_exception(exception, stacktrace) when is_exception(exception) do
    message = Exception.message(exception)
    type = exception.__struct__ |> Module.split() |> List.last()
    stack = Exception.format_stacktrace(stacktrace)

    %{message: message, type: type, stack: stack}
  end

  defp normalise_exception(exception, _stacktrace) when is_binary(exception) do
    %{message: exception, type: "StringError", stack: nil}
  end

  defp normalise_exception(exception, _stacktrace) do
    %{message: inspect(exception), type: "UnknownError", stack: nil}
  end

  defp should_ignore?(_message, []), do: false

  defp should_ignore?(message, ignore_errors) do
    Enum.any?(ignore_errors, fn pattern ->
      cond do
        is_binary(pattern) -> String.contains?(message, pattern)
        is_struct(pattern, Regex) -> Regex.match?(pattern, message)
        true -> false
      end
    end)
  end

  defp rate_limit_check(fingerprint, state) do
    now = System.monotonic_time(:millisecond)
    cutoff = now - @window_ms

    # Prune global timestamps
    global_timestamps = Enum.filter(state.global_timestamps, &(&1 > cutoff))

    if length(global_timestamps) >= state.config.max_events_per_minute do
      {false, %{state | global_timestamps: global_timestamps}}
    else
      # Prune per-fingerprint timestamps
      fp_timestamps = Map.get(state.fp_timestamps, fingerprint, [])
      fp_timestamps = Enum.filter(fp_timestamps, &(&1 > cutoff))

      if length(fp_timestamps) >= @per_fingerprint_max do
        new_fp_map = Map.put(state.fp_timestamps, fingerprint, fp_timestamps)

        {false,
         %{state | global_timestamps: global_timestamps, fp_timestamps: new_fp_map}}
      else
        new_global = [now | global_timestamps]
        new_fp = [now | fp_timestamps]
        new_fp_map = Map.put(state.fp_timestamps, fingerprint, new_fp)

        {true,
         %{state | global_timestamps: new_global, fp_timestamps: new_fp_map}}
      end
    end
  end

  defp detect_environment(config) do
    env = %{
      runtime: "beam",
      runtimeVersion: System.version(),
      platform: to_string(:os.type() |> elem(1)),
      os: detect_os()
    }

    env =
      if config.environment do
        Map.put(env, :deploy, config.environment)
      else
        env
      end

    # Framework detection
    cond do
      Code.ensure_loaded?(Phoenix) ->
        Map.put(env, :framework, "phoenix")

      Code.ensure_loaded?(Plug) ->
        Map.put(env, :framework, "plug")

      true ->
        env
    end
  end

  defp detect_os do
    case :os.type() do
      {:unix, :darwin} -> "macOS"
      {:unix, :linux} -> "Linux"
      {:win32, _} -> "Windows"
      {_, os} -> to_string(os)
    end
  end

  defp generate_uuid do
    <<a::32, b::16, _c::4, c::12, _d::2, d::14, e::48>> = :crypto.strong_rand_bytes(16)

    [
      Integer.to_string(a, 16) |> String.pad_leading(8, "0"),
      Integer.to_string(b, 16) |> String.pad_leading(4, "0"),
      Integer.to_string(0x4000 ||| c, 16) |> String.pad_leading(4, "0"),
      Integer.to_string(0x8000 ||| d, 16) |> String.pad_leading(4, "0"),
      Integer.to_string(e, 16) |> String.pad_leading(12, "0")
    ]
    |> Enum.join("-")
    |> String.downcase()
  end

  defp iso_timestamp do
    DateTime.utc_now() |> DateTime.to_iso8601()
  end

  defp debug_log(state, message) do
    if state.config.debug do
      require Logger
      Logger.debug("[uncaught] #{message}")
    end
  end
end
