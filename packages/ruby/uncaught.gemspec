# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name = "uncaught"
  spec.version = "0.1.0"
  spec.authors = ["Uncaught Dev"]
  spec.summary = "Local-first, AI-ready error monitoring for Ruby"
  spec.description = "Catch bugs locally, get AI-powered fixes. Works with Rails and Sinatra."
  spec.homepage = "https://github.com/ajeeshworkspace/uncaught"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 2.7.0"
  spec.files = Dir["lib/**/*", "LICENSE", "README.md"]
  spec.require_paths = ["lib"]
end
