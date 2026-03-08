// ---------------------------------------------------------------------------
// uncaught — shared type definitions
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// How captured events are delivered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransportMode {
    Remote,
    Local,
    Console,
}

impl Default for TransportMode {
    fn default() -> Self {
        TransportMode::Local
    }
}

/// Severity levels mirroring syslog.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SeverityLevel {
    Fatal,
    Error,
    Warning,
    Info,
    Debug,
}

impl Default for SeverityLevel {
    fn default() -> Self {
        SeverityLevel::Error
    }
}

impl std::fmt::Display for SeverityLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SeverityLevel::Fatal => write!(f, "fatal"),
            SeverityLevel::Error => write!(f, "error"),
            SeverityLevel::Warning => write!(f, "warning"),
            SeverityLevel::Info => write!(f, "info"),
            SeverityLevel::Debug => write!(f, "debug"),
        }
    }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration object passed to `init_uncaught()`.
#[derive(Debug, Clone)]
pub struct UncaughtConfig {
    /// Project key used for authentication with the remote endpoint.
    pub project_key: Option<String>,
    /// Remote ingestion endpoint URL. Required when transport is 'remote'.
    pub endpoint: Option<String>,
    /// Deployment environment label (e.g. "production", "staging").
    pub environment: Option<String>,
    /// Release / version identifier.
    pub release: Option<String>,
    /// When true, the SDK logs internal debug information to stderr.
    pub debug: bool,
    /// Master kill-switch. When false the SDK is completely inert.
    pub enabled: bool,
    /// Maximum number of breadcrumbs retained in the ring buffer.
    pub max_breadcrumbs: usize,
    /// Rate-limit: max events accepted per 60-second sliding window.
    pub max_events_per_minute: usize,
    /// Additional key patterns to redact during sanitization.
    pub sanitize_keys: Vec<String>,
    /// An array of string patterns. If the error message matches any
    /// of these the event is silently dropped.
    pub ignore_errors: Vec<String>,
    /// Transport strategy.
    pub transport: TransportMode,
    /// Directory used by the local-file transport.
    /// Defaults to `$CWD/.uncaught`.
    pub local_output_dir: Option<String>,
}

impl Default for UncaughtConfig {
    fn default() -> Self {
        Self {
            project_key: None,
            endpoint: None,
            environment: None,
            release: None,
            debug: false,
            enabled: true,
            max_breadcrumbs: 20,
            max_events_per_minute: 30,
            sanitize_keys: vec![],
            ignore_errors: vec![],
            transport: TransportMode::Local,
            local_output_dir: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// Structured representation of a captured error.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorInfo {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_stack: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_stack: Option<String>,
}

/// Contextual HTTP request information attached to an event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<HashMap<String, String>>,
}

/// Information about a failed external operation (DB, auth, API, etc.).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationInfo {
    pub provider: String,
    #[serde(rename = "type")]
    pub operation_type: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_details: Option<String>,
}

/// User context attached to events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// SDK metadata shipped with every event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdkInfo {
    pub name: String,
    pub version: String,
}

/// The canonical event payload sent to transports.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UncaughtEvent {
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "projectKey")]
    pub project_key: Option<String>,
    pub level: SeverityLevel,
    pub fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<String>,
    pub error: ErrorInfo,
    pub breadcrumbs: Vec<Breadcrumb>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request: Option<RequestInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation: Option<OperationInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<EnvironmentInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "userFeedback")]
    pub user_feedback: Option<String>,
    #[serde(rename = "fixPrompt")]
    pub fix_prompt: String,
    pub sdk: SdkInfo,
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

/// Breadcrumb categories.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BreadcrumbType {
    Click,
    Navigation,
    ApiCall,
    DbQuery,
    Auth,
    Console,
    WebVital,
    Custom,
}

/// A single breadcrumb entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Breadcrumb {
    #[serde(rename = "type")]
    pub crumb_type: BreadcrumbType,
    pub category: String,
    pub message: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<SeverityLevel>,
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/// Detected runtime / platform information.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EnvironmentInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "frameworkVersion")]
    pub framework_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "runtimeVersion")]
    pub runtime_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browser: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "browserVersion")]
    pub browser_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "deviceType")]
    pub device_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deploy: Option<String>,
}

// ---------------------------------------------------------------------------
// Local issues index
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum IssueStatus {
    Open,
    Resolved,
    Ignored,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueEntry {
    pub fingerprint: String,
    pub title: String,
    #[serde(rename = "errorType")]
    pub error_type: String,
    pub count: u64,
    #[serde(rename = "affectedUsers")]
    pub affected_users: Vec<String>,
    #[serde(rename = "firstSeen")]
    pub first_seen: String,
    #[serde(rename = "lastSeen")]
    pub last_seen: String,
    pub status: IssueStatus,
    #[serde(rename = "fixPromptFile")]
    pub fix_prompt_file: String,
    #[serde(rename = "latestEventFile")]
    pub latest_event_file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
}

/// Context for capturing an error with additional metadata.
#[derive(Debug, Clone, Default)]
pub struct CaptureContext {
    pub request: Option<RequestInfo>,
    pub operation: Option<OperationInfo>,
    pub component_stack: Option<String>,
    pub level: Option<SeverityLevel>,
}
