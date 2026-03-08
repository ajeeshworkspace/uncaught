defmodule Uncaught.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Uncaught.BreadcrumbStore,
      Uncaught.Client
    ]

    opts = [strategy: :one_for_one, name: Uncaught.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
