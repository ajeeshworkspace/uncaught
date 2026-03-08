defmodule Uncaught.Integrations.Plug do
  @moduledoc """
  Plug middleware for capturing errors and adding HTTP context.

  ## Usage

  In your Plug router or endpoint:

      plug Uncaught.Integrations.Plug

  Or in Phoenix's endpoint.ex:

      plug Uncaught.Integrations.Plug
  """

  @behaviour Plug

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    # Add navigation breadcrumb
    Uncaught.add_breadcrumb(
      :navigation,
      "http",
      "#{conn.method} #{conn.request_path}",
      %{
        method: conn.method,
        url: request_url(conn),
        remote_ip: format_ip(conn.remote_ip)
      }
    )

    # Register a before_send callback to catch errors
    Plug.Conn.register_before_send(conn, fn conn ->
      if conn.status >= 500 do
        Uncaught.add_breadcrumb(
          :api_call,
          "http.response",
          "HTTP #{conn.status}",
          %{status: conn.status}
        )
      end

      conn
    end)
  rescue
    exception ->
      # Build request context
      request_context = %{
        method: conn.method,
        url: request_url(conn),
        headers: sanitize_headers(conn.req_headers),
        query: conn.query_params
      }

      # Capture with request context
      Uncaught.capture_exception(exception, __STACKTRACE__, %{
        request: request_context
      })

      reraise exception, __STACKTRACE__
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp request_url(conn) do
    scheme = to_string(conn.scheme)
    host = conn.host || "localhost"
    port = conn.port

    port_str =
      cond do
        scheme == "https" && port == 443 -> ""
        scheme == "http" && port == 80 -> ""
        true -> ":#{port}"
      end

    "#{scheme}://#{host}#{port_str}#{conn.request_path}"
  end

  defp format_ip(ip) when is_tuple(ip) do
    ip |> Tuple.to_list() |> Enum.join(".")
  end

  defp format_ip(ip), do: to_string(ip)

  defp sanitize_headers(headers) do
    safe_headers = [
      "host",
      "user-agent",
      "accept",
      "accept-language",
      "accept-encoding",
      "content-type",
      "content-length",
      "referer",
      "origin",
      "x-requested-with"
    ]

    headers
    |> Enum.filter(fn {key, _value} ->
      String.downcase(key) in safe_headers
    end)
    |> Map.new(fn {key, value} -> {key, value} end)
  end
end
