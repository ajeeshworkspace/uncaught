// ---------------------------------------------------------------------------
// uncaught — UncaughtClient (SDK entry-point)
// ---------------------------------------------------------------------------

use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};

use chrono::Utc;
use uuid::Uuid;

use crate::breadcrumbs::BreadcrumbStore;
use crate::env_detector::detect_environment;
use crate::fingerprint::generate_fingerprint;
use crate::prompt_builder::build_fix_prompt;
use crate::rate_limiter::RateLimiter;
use crate::sanitizer::sanitize;
use crate::transport::{create_transport, Transport};
use crate::types::*;

const SDK_NAME: &str = "uncaught-rust";
const SDK_VERSION: &str = "0.1.0";

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

static CLIENT: OnceLock<Arc<UncaughtClient>> = OnceLock::new();

/// Initialise the Uncaught SDK. Calling this more than once has no effect;
/// the first configuration wins.
pub fn init_uncaught(config: UncaughtConfig) -> Arc<UncaughtClient> {
    CLIENT
        .get_or_init(|| Arc::new(UncaughtClient::new(config)))
        .clone()
}

/// Return the current singleton client, or `None` if `init_uncaught` has
/// not been called.
pub fn get_client() -> Option<Arc<UncaughtClient>> {
    CLIENT.get().cloned()
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

pub struct UncaughtClient {
    config: UncaughtConfig,
    breadcrumbs: BreadcrumbStore,
    transport: Box<dyn Transport + Send + Sync>,
    rate_limiter: RateLimiter,
    session_id: String,
    seen_fingerprints: Mutex<HashSet<String>>,
    user: Mutex<Option<UserInfo>>,
}

impl UncaughtClient {
    /// Create a new client with the given configuration.
    pub fn new(config: UncaughtConfig) -> Self {
        let breadcrumbs = BreadcrumbStore::new(config.max_breadcrumbs);
        let transport = create_transport(&config);
        let rate_limiter = RateLimiter::new(config.max_events_per_minute, 5);
        let session_id = Uuid::new_v4().to_string();

        Self {
            config,
            breadcrumbs,
            transport,
            rate_limiter,
            session_id,
            seen_fingerprints: Mutex::new(HashSet::new()),
            user: Mutex::new(None),
        }
    }

    /// Return the current SDK configuration.
    pub fn get_config(&self) -> &UncaughtConfig {
        &self.config
    }

    /// Capture an error and send it through the transport pipeline.
    ///
    /// Returns the event ID, or `None` if the event was dropped.
    pub fn capture_error(
        &self,
        error_type: &str,
        message: &str,
        stack: Option<&str>,
        context: Option<CaptureContext>,
    ) -> Option<String> {
        if !self.config.enabled {
            return None;
        }

        let ctx = context.unwrap_or_default();

        // Check ignore_errors
        if self.should_ignore(message) {
            self.debug_log("Event ignored by ignore_errors filter");
            return None;
        }

        // Generate fingerprint
        let fingerprint = generate_fingerprint(error_type, message, stack);

        // Rate limit
        if !self.rate_limiter.should_allow(&fingerprint) {
            self.debug_log(&format!("Rate-limited: {}", fingerprint));
            return None;
        }

        // Collect breadcrumbs
        let crumbs = self.breadcrumbs.get_all();

        // Detect environment
        let mut environment = detect_environment();
        if let Some(ref env) = self.config.environment {
            environment.deploy = Some(env.clone());
        }

        // Build user info
        let user = {
            let user_lock = self.user.lock().ok()?;
            let mut u = user_lock.clone().unwrap_or(UserInfo {
                id: None,
                email: None,
                username: None,
                session_id: None,
                extra: Default::default(),
            });
            u.session_id = Some(self.session_id.clone());
            Some(u)
        };

        // Build event
        let event_id = Uuid::new_v4().to_string();
        let mut event = UncaughtEvent {
            event_id: event_id.clone(),
            timestamp: Utc::now().to_rfc3339(),
            project_key: self.config.project_key.clone(),
            level: ctx.level.unwrap_or(SeverityLevel::Error),
            fingerprint: fingerprint.clone(),
            release: self.config.release.clone(),
            error: ErrorInfo {
                message: message.to_string(),
                error_type: error_type.to_string(),
                stack: stack.map(|s| s.to_string()),
                resolved_stack: None,
                component_stack: ctx.component_stack,
            },
            breadcrumbs: crumbs,
            request: ctx.request,
            operation: ctx.operation,
            environment: Some(environment),
            user,
            user_feedback: None,
            fix_prompt: String::new(),
            sdk: SdkInfo {
                name: SDK_NAME.to_string(),
                version: SDK_VERSION.to_string(),
            },
        };

        // Sanitize
        event = sanitize(event, &self.config.sanitize_keys);

        // Build fix prompt
        event.fix_prompt = build_fix_prompt(&event);

        // Send
        self.transport.send(&event);
        self.debug_log(&format!("Captured event: {} ({})", event_id, fingerprint));

        // Track seen fingerprints
        if let Ok(mut seen) = self.seen_fingerprints.lock() {
            seen.insert(fingerprint);
        }

        Some(event_id)
    }

    /// Capture a plain message (not backed by an Error instance).
    pub fn capture_message(&self, message: &str, level: SeverityLevel) -> Option<String> {
        self.capture_error(
            "Message",
            message,
            None,
            Some(CaptureContext {
                level: Some(level),
                ..Default::default()
            }),
        )
    }

    /// Add a breadcrumb to the ring buffer.
    pub fn add_breadcrumb(
        &self,
        crumb_type: BreadcrumbType,
        category: &str,
        message: &str,
        data: Option<std::collections::HashMap<String, serde_json::Value>>,
        level: Option<SeverityLevel>,
    ) {
        if !self.config.enabled {
            return;
        }
        self.breadcrumbs.add(Breadcrumb {
            crumb_type,
            category: category.to_string(),
            message: message.to_string(),
            timestamp: Utc::now().to_rfc3339(),
            data,
            level,
        });
    }

    /// Set user context that will be attached to subsequent events.
    pub fn set_user(&self, user: Option<UserInfo>) {
        if let Ok(mut u) = self.user.lock() {
            *u = user;
        }
    }

    /// Flush all queued events to the transport.
    pub fn flush(&self) {
        self.transport.flush();
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn should_ignore(&self, message: &str) -> bool {
        for pattern in &self.config.ignore_errors {
            if message.contains(pattern.as_str()) {
                return true;
            }
        }
        false
    }

    fn debug_log(&self, msg: &str) {
        if self.config.debug {
            eprintln!("[uncaught] {}", msg);
        }
    }
}
