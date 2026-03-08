defmodule Uncaught.BreadcrumbStore do
  @moduledoc """
  Agent-based ring-buffer store for breadcrumbs.

  Thread-safe via Elixir's Agent abstraction.
  Oldest entries are silently discarded when capacity is reached.
  """

  use Agent

  @default_capacity 20

  def start_link(_opts \\ []) do
    capacity = Application.get_env(:uncaught, :max_breadcrumbs, @default_capacity)

    Agent.start_link(
      fn -> %{buffer: :queue.new(), capacity: capacity, size: 0} end,
      name: __MODULE__
    )
  end

  @doc """
  Add a breadcrumb to the ring buffer.
  """
  def add(crumb) do
    Agent.update(__MODULE__, fn state ->
      if state.size >= state.capacity do
        {_, buffer} = :queue.out(state.buffer)
        buffer = :queue.in(crumb, buffer)
        %{state | buffer: buffer}
      else
        buffer = :queue.in(crumb, state.buffer)
        %{state | buffer: buffer, size: state.size + 1}
      end
    end)
  end

  @doc """
  Return all stored breadcrumbs in chronological order.
  """
  def get_all do
    Agent.get(__MODULE__, fn state ->
      :queue.to_list(state.buffer)
    end)
  end

  @doc """
  Return the most recent N breadcrumbs.
  """
  def get_last(n) do
    Agent.get(__MODULE__, fn state ->
      all = :queue.to_list(state.buffer)
      Enum.take(all, -n)
    end)
  end

  @doc """
  Empty the buffer.
  """
  def clear do
    Agent.update(__MODULE__, fn state ->
      %{state | buffer: :queue.new(), size: 0}
    end)
  end
end
