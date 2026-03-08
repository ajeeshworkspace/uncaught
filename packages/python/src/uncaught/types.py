"""Shared type definitions matching the Uncaught contract."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

SeverityLevel = Literal["fatal", "error", "warning", "info", "debug"]
IssueStatus = Literal["open", "resolved", "ignored"]
BreadcrumbType = Literal[
    "click", "navigation", "api_call", "db_query", "auth", "console", "web_vital", "custom"
]
TransportMode = Literal["local", "console", "remote"]


class ErrorInfo(TypedDict, total=False):
    message: str
    type: str
    stack: str
    resolvedStack: str
    componentStack: str
    raw: Any


class RequestInfo(TypedDict, total=False):
    method: str
    url: str
    headers: dict[str, str]
    body: Any
    query: dict[str, str]


class OperationInfo(TypedDict, total=False):
    provider: str
    type: str
    method: str
    params: dict[str, Any]
    errorCode: str
    errorDetails: str


class UserInfo(TypedDict, total=False):
    id: str
    email: str
    username: str


class SdkInfo(TypedDict):
    name: str
    version: str


class EnvironmentInfo(TypedDict, total=False):
    framework: str
    frameworkVersion: str
    runtime: str
    runtimeVersion: str
    platform: str
    os: str
    browser: str
    browserVersion: str
    deviceType: str
    locale: str
    timezone: str
    url: str
    deploy: str


class Breadcrumb(TypedDict, total=False):
    type: BreadcrumbType
    category: str
    message: str
    timestamp: str
    data: dict[str, Any]
    level: SeverityLevel


class UncaughtEvent(TypedDict, total=False):
    eventId: str
    timestamp: str
    projectKey: str
    level: SeverityLevel
    fingerprint: str
    release: str
    error: ErrorInfo
    breadcrumbs: list[Breadcrumb]
    request: RequestInfo
    operation: OperationInfo
    environment: EnvironmentInfo
    user: UserInfo
    userFeedback: str
    fixPrompt: str
    sdk: SdkInfo


class IssueEntry(TypedDict, total=False):
    fingerprint: str
    title: str
    errorType: str
    count: int
    affectedUsers: list[str]
    firstSeen: str
    lastSeen: str
    status: IssueStatus
    fixPromptFile: str
    latestEventFile: str
    release: str
    environment: str


class UncaughtConfig(TypedDict, total=False):
    project_key: str
    endpoint: str
    environment: str
    release: str
    debug: bool
    enabled: bool
    max_breadcrumbs: int
    max_events_per_minute: int
    before_send: Any  # Callable[[UncaughtEvent], UncaughtEvent | None]
    sanitize_keys: list[str]
    ignore_errors: list[str]
    transport: TransportMode
    local_output_dir: str
    webhook_url: str
