defmodule Uncaught.Transport do
  @moduledoc """
  Transport layer — writes events to .uncaught/ directory (local file transport).
  """

  @doc """
  Send an event through the configured transport.
  """
  def send(event, config) do
    case config.transport do
      :console -> send_console(event)
      :local -> send_local(event, config)
      _ -> send_local(event, config)
    end
  end

  @doc """
  Flush queued events. Local file transport writes synchronously, so this is a no-op.
  """
  def flush do
    :ok
  end

  # ---------------------------------------------------------------------------
  # Console Transport
  # ---------------------------------------------------------------------------

  defp send_console(event) do
    title =
      "[uncaught] #{get_in(event, [:error, :type])}: #{get_in(event, [:error, :message])}"

    IO.puts("--- #{title} ---")
    IO.puts("Event ID: #{event.eventId}")
    IO.puts("Fingerprint: #{event.fingerprint}")

    if event.error[:stack] do
      IO.puts("Stack: #{event.error.stack}")
    end

    if event.fixPrompt != "" do
      IO.puts("Fix Prompt:\n#{event.fixPrompt}")
    end

    IO.puts("---")
    :ok
  end

  # ---------------------------------------------------------------------------
  # Local File Transport
  # ---------------------------------------------------------------------------

  defp send_local(event, config) do
    try do
      base_dir = config.local_output_dir || Path.join(File.cwd!(), ".uncaught")

      # Ensure directory structure
      events_dir = Path.join(base_dir, "events")
      prompts_dir = Path.join(base_dir, "fix-prompts")
      File.mkdir_p!(events_dir)
      File.mkdir_p!(prompts_dir)

      # Ensure .gitignore
      ensure_gitignore(base_dir)

      fp = event.fingerprint
      event_dir = Path.join(events_dir, fp)
      File.mkdir_p!(event_dir)

      # Serialize event
      json = Jason.encode!(event, pretty: true)

      # Write timestamped event file (atomic: .tmp -> rename)
      ts = String.replace(event.timestamp, ~r/[:.]/, "-")
      event_file = "event-#{ts}.json"
      event_path = Path.join(event_dir, event_file)
      tmp_event_path = event_path <> ".tmp"
      File.write!(tmp_event_path, json)
      File.rename!(tmp_event_path, event_path)

      # Write / overwrite latest.json
      latest_path = Path.join(event_dir, "latest.json")
      tmp_latest_path = latest_path <> ".tmp"
      File.write!(tmp_latest_path, json)
      File.rename!(tmp_latest_path, latest_path)

      # Write fix-prompt Markdown file
      prompt_file = "#{fp}.md"
      prompt_path = Path.join(prompts_dir, prompt_file)
      tmp_prompt_path = prompt_path <> ".tmp"
      File.write!(tmp_prompt_path, event.fixPrompt || "")
      File.rename!(tmp_prompt_path, prompt_path)

      # Update issues.json index
      update_issues_index(base_dir, event, event_file, prompt_file)

      :ok
    rescue
      e ->
        if config.debug do
          require Logger
          Logger.error("[uncaught] Transport error: #{inspect(e)}")
        end

        :error
    end
  end

  defp ensure_gitignore(base_dir) do
    try do
      gitignore_path = Path.join(Path.dirname(base_dir), ".gitignore")

      content =
        case File.read(gitignore_path) do
          {:ok, data} -> data
          {:error, _} -> ""
        end

      unless String.contains?(content, ".uncaught") do
        line = "\n# Uncaught local error store\n.uncaught/\n"
        File.write(gitignore_path, content <> line)
      end
    rescue
      _ -> :ok
    end
  end

  defp update_issues_index(base_dir, event, event_file, prompt_file) do
    index_path = Path.join(base_dir, "issues.json")

    issues =
      case File.read(index_path) do
        {:ok, raw} ->
          case Jason.decode(raw) do
            {:ok, decoded} when is_list(decoded) -> decoded
            _ -> []
          end

        {:error, _} ->
          []
      end

    user_id =
      (get_in(event, [:user, :id]) || get_in(event, [:user, :email]) || "anonymous")
      |> to_string()

    existing_idx =
      Enum.find_index(issues, fn issue ->
        issue["fingerprint"] == event.fingerprint
      end)

    issues =
      if existing_idx do
        List.update_at(issues, existing_idx, fn existing ->
          affected = existing["affectedUsers"] || []

          affected =
            if user_id in affected, do: affected, else: affected ++ [user_id]

          status =
            if existing["status"] == "resolved", do: "open", else: existing["status"]

          %{
            existing
            | "count" => (existing["count"] || 0) + 1,
              "lastSeen" => event.timestamp,
              "latestEventFile" => event_file,
              "fixPromptFile" => prompt_file,
              "affectedUsers" => affected,
              "status" => status
          }
        end)
      else
        issues ++
          [
            %{
              "fingerprint" => event.fingerprint,
              "title" => event.error.message,
              "errorType" => event.error.type,
              "count" => 1,
              "affectedUsers" => [user_id],
              "firstSeen" => event.timestamp,
              "lastSeen" => event.timestamp,
              "status" => "open",
              "fixPromptFile" => prompt_file,
              "latestEventFile" => event_file,
              "release" => event.release,
              "environment" => get_in(event, [:environment, :deploy])
            }
          ]
      end

    # Atomic write
    tmp_index_path = index_path <> ".tmp"
    json = Jason.encode!(issues, pretty: true)
    File.write!(tmp_index_path, json)
    File.rename!(tmp_index_path, index_path)
  end

  defp get_in(map, keys) when is_map(map) do
    Enum.reduce_while(keys, map, fn key, acc ->
      case acc do
        %{^key => value} -> {:cont, value}
        _ -> {:halt, nil}
      end
    end)
  end

  defp get_in(_, _), do: nil
end
