defmodule Uncaught.MixProject do
  use Mix.Project

  def project do
    [
      app: :uncaught,
      version: "0.1.0",
      elixir: "~> 1.14",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      description: "Local-first, AI-ready error monitoring for Elixir",
      package: package()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {Uncaught.Application, []}
    ]
  end

  defp deps do
    [
      {:jason, "~> 1.4"},
      {:plug, "~> 1.14", optional: true}
    ]
  end

  defp package do
    [
      licenses: ["MIT"],
      links: %{"GitHub" => "https://github.com/uncaughtdev/uncaught"}
    ]
  end
end
