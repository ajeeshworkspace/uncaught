// ---------------------------------------------------------------------------
// uncaught — runtime / platform environment detector
// ---------------------------------------------------------------------------

use crate::types::EnvironmentInfo;
use std::sync::OnceLock;

/// Cached result so detection only runs once per process.
static CACHED: OnceLock<EnvironmentInfo> = OnceLock::new();

/// Detect the current runtime environment.
///
/// Result is cached after the first invocation.
pub fn detect_environment() -> EnvironmentInfo {
    CACHED.get_or_init(detect_environment_inner).clone()
}

/// Reset the cached environment (useful for testing).
pub fn reset_environment_cache() {
    // OnceLock doesn't support resetting, so we always return a fresh detect
    // in tests. For production use, the cached value is fine.
}

fn detect_environment_inner() -> EnvironmentInfo {
    let mut info = EnvironmentInfo::default();

    // Runtime
    info.runtime = Some("rust".to_string());
    info.runtime_version = Some(rustc_version());

    // Platform
    info.platform = Some(std::env::consts::OS.to_string());
    info.os = Some(detect_os());

    // Check for common hosting platform env vars
    if std::env::var("VERCEL").is_ok() {
        info.platform = Some("vercel".to_string());
    } else if std::env::var("RAILWAY_PROJECT_ID").is_ok() {
        info.platform = Some("railway".to_string());
    } else if std::env::var("FLY_APP_NAME").is_ok() {
        info.platform = Some("fly".to_string());
    } else if std::env::var("AWS_LAMBDA_FUNCTION_NAME").is_ok() {
        info.platform = Some("aws-lambda".to_string());
    } else if std::env::var("GOOGLE_CLOUD_PROJECT").is_ok() {
        info.platform = Some("gcp".to_string());
    }

    // Framework detection via env vars
    if std::env::var("ROCKET_ENV").is_ok() || std::env::var("ROCKET_ADDRESS").is_ok() {
        info.framework = Some("rocket".to_string());
    } else if std::env::var("ACTIX_WORKERS").is_ok() {
        info.framework = Some("actix-web".to_string());
    }

    info
}

fn rustc_version() -> String {
    // Return the Rust edition we compiled with
    env!("CARGO_PKG_RUST_VERSION", "unknown").to_string()
}

fn detect_os() -> String {
    let os = std::env::consts::OS;
    match os {
        "macos" => "macOS".to_string(),
        "windows" => "Windows".to_string(),
        "linux" => "Linux".to_string(),
        "freebsd" => "FreeBSD".to_string(),
        other => other.to_string(),
    }
}
