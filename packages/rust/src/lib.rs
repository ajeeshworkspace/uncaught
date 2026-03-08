// ---------------------------------------------------------------------------
// uncaught — local-first, AI-ready error monitoring for Rust
// ---------------------------------------------------------------------------

pub mod breadcrumbs;
pub mod client;
pub mod env_detector;
pub mod fingerprint;
pub mod prompt_builder;
pub mod rate_limiter;
pub mod sanitizer;
pub mod transport;
pub mod types;

pub use client::{init_uncaught, get_client, UncaughtClient};
pub use types::*;
