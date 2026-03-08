defmodule Uncaught.Integrations.Phoenix do
  @moduledoc """
  Phoenix integration for Uncaught.

  ## Setup

  Add to your endpoint.ex:

      plug Uncaught.Integrations.Plug

  Add to your router.ex for LiveView error handling:

      use Uncaught.Integrations.Phoenix

  Or in your application.ex, add the error logger:

      # In your application start/2:
      :logger.add_handler(:uncaught_handler, Uncaught.Integrations.Phoenix.LoggerHandler, %{})
  """

  defmacro __using__(_opts) do
    quote do
      @before_compile Uncaught.Integrations.Phoenix
    end
  end

  defmacro __before_compile__(_env) do
    quote do
      # Override handle_errors if available (Phoenix 1.7+)
      if Module.defines?(__MODULE__, {:handle_errors, 2}) do
        defoverridable handle_errors: 2

        def handle_errors(conn, %{kind: kind, reason: reason, stack: stack}) do
          case kind do
            :error when is_exception(reason) ->
              request_context = %{
                method: conn.method,
                url: "#{conn.scheme}://#{conn.host}#{conn.request_path}",
                query: conn.query_params
              }

              Uncaught.capture_exception(reason, stack, %{
                request: request_context,
                level: :error
              })

            _ ->
              :ok
          end

          super(conn, %{kind: kind, reason: reason, stack: stack})
        end
      end
    end
  end
end

defmodule Uncaught.Integrations.Phoenix.LoggerHandler do
  @moduledoc """
  Erlang :logger handler that captures errors reported through Logger.

  ## Setup

      :logger.add_handler(:uncaught_handler, Uncaught.Integrations.Phoenix.LoggerHandler, %{})
  """

  @doc false
  def log(%{level: level, msg: msg, meta: meta}, _config) when level in [:error, :critical, :alert, :emergency] do
    try do
      message = format_message(msg)

      context = %{
        level:
          case level do
            :critical -> :fatal
            :alert -> :fatal
            :emergency -> :fatal
            other -> other
          end
      }

      # Extract exception and stacktrace from metadata if available
      case meta do
        %{crash_reason: {exception, stacktrace}} when is_exception(exception) ->
          Uncaught.capture_exception(exception, stacktrace, context)

        _ ->
          if message && message != "" do
            Uncaught.capture_message(message, context.level)
          end
      end
    rescue
      _ -> :ok
    end
  end

  def log(_, _), do: :ok

  defp format_message({:string, msg}), do: to_string(msg)
  defp format_message({:report, report}), do: inspect(report)

  defp format_message({format, args}) when is_list(args) do
    try do
      :io_lib.format(format, args) |> to_string()
    rescue
      _ -> inspect({format, args})
    end
  end

  defp format_message(msg), do: inspect(msg)
end
