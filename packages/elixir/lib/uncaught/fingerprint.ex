defmodule Uncaught.Fingerprint do
  @moduledoc """
  Error fingerprinting — generates stable DJB2 hashes for error grouping.

  The fingerprint is an 8-character hex string derived from:
    1. The normalised error message (volatile parts stripped).
    2. The top 3 stack frames (file + function name, no line/col numbers).
  """

  use Bitwise

  @doc """
  Generate a stable fingerprint for an error.
  """
  def generate(error_type, message, stack) do
    normalised_message = normalise_message(message || "")
    frames = extract_top_frames(stack || "", 3)
    input = Enum.join([error_type || "Error", normalised_message | frames], "\n")
    djb2(input)
  end

  @doc """
  DJB2 hash -> 8-character lowercase hex string.

  Uses signed 32-bit wrapping arithmetic to produce identical results
  to the TypeScript reference implementation.
  """
  def djb2(str) do
    hash =
      str
      |> String.to_charlist()
      |> Enum.reduce(5381, fn c, hash ->
        # hash * 33 + c, wrapping to signed 32-bit
        result = ((hash <<< 5) + hash + c) &&& 0xFFFFFFFF

        # Convert to signed 32-bit
        if result >= 0x80000000 do
          result - 0x100000000
        else
          result
        end
      end)

    # Convert to unsigned 32-bit for hex output
    unsigned = hash &&& 0xFFFFFFFF
    unsigned |> Integer.to_string(16) |> String.downcase() |> String.pad_leading(8, "0")
  end

  # ---------------------------------------------------------------------------
  # Internal helpers
  # ---------------------------------------------------------------------------

  defp normalise_message(msg) do
    msg
    # UUIDs
    |> String.replace(
      ~r/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      "<UUID>"
    )
    # Hex strings (8+ hex chars)
    |> String.replace(~r/\b[0-9a-f]{8,}\b/i, "<HEX>")
    # Numbers longer than 3 digits
    |> String.replace(~r/\b\d{4,}\b/, "<NUM>")
    # ISO timestamps
    |> String.replace(
      ~r/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?/,
      "<TIMESTAMP>"
    )
    # Hashed file paths
    |> String.replace(
      ~r/([\/\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\.(js|ts|mjs|cjs|jsx|tsx)/,
      "\\1<FILE>.\\3"
    )
    |> String.trim()
  end

  defp extract_top_frames(stack, count) when is_binary(stack) do
    if stack == "" do
      []
    else
      stack
      |> String.split("\n")
      |> Enum.reduce_while([], fn line, frames ->
        if length(frames) >= count do
          {:halt, frames}
        else
          trimmed = String.trim(line)
          case parse_frame(trimmed) do
            nil -> {:cont, frames}
            frame -> {:cont, frames ++ [frame]}
          end
        end
      end)
    end
  end

  defp extract_top_frames(_, _count), do: []

  defp parse_frame(line) do
    # Elixir stacktrace format: "  (module) file:line: Module.function/arity"
    cond do
      # Elixir format: "(app) lib/file.ex:42: Module.function/2"
      Regex.match?(~r/^\((.+?)\)\s+(.+?):(\d+):\s+(.+)/, line) ->
        case Regex.run(~r/^\((.+?)\)\s+(.+?):(\d+):\s+(.+)/, line) do
          [_, _app, file, _line_num, func] ->
            normalised = normalise_path(file)
            "#{normalised}:#{func}"

          _ ->
            nil
        end

      # V8 format: "    at FunctionName (file:line:col)"
      Regex.match?(~r/at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?/, line) ->
        case Regex.run(~r/at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?/, line) do
          [_, func, file] ->
            func = if func == "", do: "<anonymous>", else: func
            normalised = normalise_path(file)
            "#{normalised}:#{func}"

          [_, file] ->
            normalised = normalise_path(file)
            "#{normalised}:<anonymous>"

          _ ->
            nil
        end

      true ->
        nil
    end
  end

  defp normalise_path(path) do
    path
    # Strip query / hash
    |> String.replace(~r/[?#].*$/, "")
    # Collapse deep paths to deps
    |> String.replace(~r/^.*\/deps\//, "deps/")
    # Strip origin in URLs
    |> String.replace(~r/^https?:\/\/[^\/]+/, "")
    # Keep only filename
    |> String.replace(~r/^.*[\/\\]/, "")
  end
end
