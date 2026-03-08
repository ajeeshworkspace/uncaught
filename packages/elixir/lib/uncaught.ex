defmodule Uncaught do
  @moduledoc """
  Local-first, AI-ready error monitoring for Elixir.

  ## Usage

      # In your application's config/config.exs:
      config :uncaught,
        environment: "production",
        release: "1.0.0",
        debug: false

      # Capture an error:
      Uncaught.capture_exception(exception, stacktrace)

      # Capture a message:
      Uncaught.capture_message("Something went wrong", :warning)

      # Add a breadcrumb:
      Uncaught.add_breadcrumb(:navigation, "http", "GET /users")
  """

  @doc """
  Capture an exception with its stacktrace.

  Returns `{:ok, event_id}` or `:error` if the event was dropped.
  """
  def capture_exception(exception, stacktrace \\ [], context \\ %{}) do
    Uncaught.Client.capture_exception(exception, stacktrace, context)
  end

  @doc """
  Capture a plain message (not backed by an exception).
  """
  def capture_message(message, level \\ :error) do
    Uncaught.Client.capture_message(message, level)
  end

  @doc """
  Add a breadcrumb to the ring buffer.
  """
  def add_breadcrumb(type, category, message, data \\ nil, level \\ nil) do
    Uncaught.Client.add_breadcrumb(type, category, message, data, level)
  end

  @doc """
  Set user context that will be attached to subsequent events.
  """
  def set_user(user) do
    Uncaught.Client.set_user(user)
  end

  @doc """
  Clear user context.
  """
  def clear_user do
    Uncaught.Client.set_user(nil)
  end

  @doc """
  Flush all queued events.
  """
  def flush do
    Uncaught.Client.flush()
  end
end
