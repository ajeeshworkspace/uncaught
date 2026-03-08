defmodule Uncaught.PromptBuilder do
  @moduledoc """
  Fix-prompt builder — generates structured Markdown prompts for AI assistants.
  """

  @doc """
  Build a structured Markdown prompt for diagnosing and fixing the error.
  """
  def build(event) do
    sections = []

    # Intro
    sections =
      sections ++
        ["I have a production bug in my application that I need help diagnosing and fixing.\n"]

    # Error section
    sections =
      if event[:error] do
        error = event.error
        location = extract_location(error[:stack])
        lines = ["## Error", ""]
        lines = lines ++ ["- **Type:** #{error[:type] || "Error"}"]
        lines = lines ++ ["- **Message:** #{error[:message] || "(no message)"}"]

        lines =
          if location do
            lines ++ ["- **Location:** #{location}"]
          else
            lines
          end

        sections ++ [Enum.join(lines, "\n")]
      else
        sections
      end

    # Stack Trace
    stack_source = get_in_map(event, [:error, :resolvedStack]) || get_in_map(event, [:error, :stack])

    sections =
      if stack_source do
        frames =
          stack_source
          |> String.split("\n")
          |> Enum.take(15)
          |> Enum.map(&String.trim_trailing/1)
          |> Enum.join("\n")

        label =
          if get_in_map(event, [:error, :resolvedStack]) do
            "Stack Trace (source-mapped)"
          else
            "Stack Trace"
          end

        sections ++ ["## #{label}\n\n```\n#{frames}\n```"]
      else
        sections
      end

    # Failed Operation
    sections =
      if event[:operation] do
        sections ++ [format_operation(event.operation)]
      else
        sections
      end

    # HTTP Request Context
    sections =
      if event[:request] do
        sections ++ [format_request(event.request)]
      else
        sections
      end

    # User Session (last 5 breadcrumbs)
    sections =
      if event[:breadcrumbs] && length(event.breadcrumbs) > 0 do
        sections ++ [format_breadcrumbs(event.breadcrumbs)]
      else
        sections
      end

    # Environment
    sections =
      if event[:environment] do
        sections ++ [format_environment(event.environment)]
      else
        sections
      end

    # What I need
    sections =
      sections ++
        [
          Enum.join(
            [
              "## What I need",
              "",
              "1. **Root cause analysis** — explain why this error is occurring.",
              "2. **A fix** — provide the corrected code with an explanation of the changes.",
              "3. **Prevention** — suggest any guards or tests to prevent this from happening again."
            ],
            "\n"
          )
        ]

    Enum.join(sections, "\n\n") <> "\n"
  end

  # ---------------------------------------------------------------------------
  # Internal helpers
  # ---------------------------------------------------------------------------

  defp extract_location(nil), do: nil

  defp extract_location(stack) do
    stack
    |> String.split("\n")
    |> Enum.find_value(fn line ->
      trimmed = String.trim(line)

      # Elixir format: "(app) lib/file.ex:42: Module.function/2"
      case Regex.run(~r/^\((.+?)\)\s+(.+?:\d+)/, trimmed) do
        [_, _app, location] -> location
        _ ->
          # V8: "    at fn (file:line:col)"
          case Regex.run(~r/at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?/, trimmed) do
            [_, location] -> location
            _ -> nil
          end
      end
    end)
  end

  defp format_operation(op) do
    lines = ["## Failed Operation", ""]
    lines = lines ++ ["- **Provider:** #{op[:provider] || ""}"]
    lines = lines ++ ["- **Type:** #{op[:type] || ""}"]
    lines = lines ++ ["- **Method:** #{op[:method] || ""}"]

    lines =
      if op[:params] do
        json = Jason.encode!(op.params, pretty: true)
        lines ++ ["- **Params:**", "```json", json, "```"]
      else
        lines
      end

    lines =
      if op[:errorCode] do
        lines ++ ["- **Error Code:** #{op.errorCode}"]
      else
        lines
      end

    lines =
      if op[:errorDetails] do
        lines ++ ["- **Error Details:** #{op.errorDetails}"]
      else
        lines
      end

    Enum.join(lines, "\n")
  end

  defp format_request(req) do
    lines = ["## HTTP Request Context", ""]

    lines =
      if req[:method] do
        lines ++ ["- **Method:** #{req.method}"]
      else
        lines
      end

    lines =
      if req[:url] do
        lines ++ ["- **URL:** #{req.url}"]
      else
        lines
      end

    lines =
      if req[:body] do
        body_str =
          if is_binary(req.body), do: req.body, else: Jason.encode!(req.body, pretty: true)

        lines ++ ["- **Body:**", "```json", body_str, "```"]
      else
        lines
      end

    Enum.join(lines, "\n")
  end

  defp format_breadcrumbs(crumbs) do
    recent = Enum.take(crumbs, -5)
    lines = ["## User Session", ""]

    lines =
      lines ++
        Enum.map(recent, fn crumb ->
          time = format_time(crumb[:timestamp] || "")
          type = crumb[:type] || "custom"
          message = crumb[:message] || ""
          "- `#{time}` **[#{type}]** #{message}"
        end)

    Enum.join(lines, "\n")
  end

  defp format_time(iso) do
    case Regex.run(~r/T(\d{2}:\d{2}:\d{2})/, iso) do
      [_, time] -> time
      _ -> iso
    end
  end

  defp format_environment(env) do
    lines = ["## Environment", ""]

    entries = [
      {"Deploy Environment", env[:deploy]},
      {"Framework", env[:framework]},
      {"Framework Version", env[:frameworkVersion]},
      {"Runtime", env[:runtime]},
      {"Runtime Version", env[:runtimeVersion]},
      {"Platform", env[:platform]},
      {"Browser",
       if(env[:browser],
         do: String.trim("#{env[:browser]} #{env[:browserVersion] || ""}"),
         else: nil
       )},
      {"OS", env[:os]},
      {"Device", env[:deviceType]},
      {"Locale", env[:locale]},
      {"Timezone", env[:timezone]},
      {"URL", env[:url]}
    ]

    lines =
      lines ++
        Enum.reduce(entries, [], fn {label, value}, acc ->
          if value && value != "" do
            acc ++ ["- **#{label}:** #{value}"]
          else
            acc
          end
        end)

    Enum.join(lines, "\n")
  end

  defp get_in_map(map, keys) when is_map(map) do
    Enum.reduce_while(keys, map, fn key, acc ->
      case acc do
        %{^key => value} -> {:cont, value}
        _ -> {:halt, nil}
      end
    end)
  end

  defp get_in_map(_, _), do: nil
end
