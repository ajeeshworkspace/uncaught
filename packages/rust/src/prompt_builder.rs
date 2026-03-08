// ---------------------------------------------------------------------------
// uncaught — fix-prompt builder
// ---------------------------------------------------------------------------

use crate::types::*;
use regex::Regex;

/// Build a structured Markdown prompt that can be pasted into an AI assistant
/// to diagnose and fix the production error described by `event`.
///
/// Empty sections are omitted to keep the prompt concise.
pub fn build_fix_prompt(event: &UncaughtEvent) -> String {
    let mut sections: Vec<String> = Vec::new();

    // Intro
    sections.push(
        "I have a production bug in my application that I need help diagnosing and fixing.\n"
            .to_string(),
    );

    // Error section
    {
        let location = extract_location(event.error.stack.as_deref());
        let mut lines = vec!["## Error".to_string(), String::new()];
        lines.push(format!("- **Type:** {}", event.error.error_type));
        lines.push(format!("- **Message:** {}", event.error.message));
        if let Some(loc) = location {
            lines.push(format!("- **Location:** {}", loc));
        }
        sections.push(lines.join("\n"));
    }

    // Stack Trace
    let stack_source = event
        .error
        .resolved_stack
        .as_deref()
        .or(event.error.stack.as_deref());
    if let Some(stack) = stack_source {
        let frames: Vec<&str> = stack.lines().take(15).collect();
        let label = if event.error.resolved_stack.is_some() {
            "Stack Trace (source-mapped)"
        } else {
            "Stack Trace"
        };
        sections.push(format!(
            "## {}\n\n```\n{}\n```",
            label,
            frames.join("\n")
        ));
    }

    // Failed Operation
    if let Some(ref op) = event.operation {
        sections.push(format_operation(op));
    }

    // HTTP Request Context
    if let Some(ref req) = event.request {
        sections.push(format_request(req));
    }

    // User Session (last 5 breadcrumbs)
    if !event.breadcrumbs.is_empty() {
        sections.push(format_breadcrumbs(&event.breadcrumbs));
    }

    // Environment
    if let Some(ref env) = event.environment {
        sections.push(format_environment(env));
    }

    // What I need
    sections.push(
        [
            "## What I need",
            "",
            "1. **Root cause analysis** — explain why this error is occurring.",
            "2. **A fix** — provide the corrected code with an explanation of the changes.",
            "3. **Prevention** — suggest any guards or tests to prevent this from happening again.",
        ]
        .join("\n"),
    );

    sections.join("\n\n") + "\n"
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Extract the top-most location (file:line:col) from a stack trace string.
fn extract_location(stack: Option<&str>) -> Option<String> {
    let stack = stack?;

    let re_v8 = Regex::new(r"at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?").ok()?;
    let re_sm = Regex::new(r"@(.+?:\d+:\d+)").ok()?;

    for line in stack.lines() {
        let trimmed = line.trim();

        if let Some(caps) = re_v8.captures(trimmed) {
            return Some(caps[1].to_string());
        }

        if let Some(caps) = re_sm.captures(trimmed) {
            return Some(caps[1].to_string());
        }
    }

    None
}

fn format_operation(op: &OperationInfo) -> String {
    let mut lines = vec!["## Failed Operation".to_string(), String::new()];
    lines.push(format!("- **Provider:** {}", op.provider));
    lines.push(format!("- **Type:** {}", op.operation_type));
    lines.push(format!("- **Method:** {}", op.method));
    if let Some(ref params) = op.params {
        lines.push("- **Params:**".to_string());
        lines.push("```json".to_string());
        if let Ok(json) = serde_json::to_string_pretty(params) {
            lines.push(json);
        }
        lines.push("```".to_string());
    }
    if let Some(ref code) = op.error_code {
        lines.push(format!("- **Error Code:** {}", code));
    }
    if let Some(ref details) = op.error_details {
        lines.push(format!("- **Error Details:** {}", details));
    }
    lines.join("\n")
}

fn format_request(req: &RequestInfo) -> String {
    let mut lines = vec!["## HTTP Request Context".to_string(), String::new()];
    if let Some(ref method) = req.method {
        lines.push(format!("- **Method:** {}", method));
    }
    if let Some(ref url) = req.url {
        lines.push(format!("- **URL:** {}", url));
    }
    if let Some(ref body) = req.body {
        lines.push("- **Body:**".to_string());
        lines.push("```json".to_string());
        if let Ok(json) = serde_json::to_string_pretty(body) {
            lines.push(json);
        }
        lines.push("```".to_string());
    }
    lines.join("\n")
}

fn format_breadcrumbs(crumbs: &[Breadcrumb]) -> String {
    let recent: Vec<&Breadcrumb> = crumbs.iter().rev().take(5).collect::<Vec<_>>();
    let recent: Vec<&&Breadcrumb> = recent.iter().rev().collect();

    let mut lines = vec!["## User Session".to_string(), String::new()];

    for crumb in recent {
        let time = format_time(&crumb.timestamp);
        let crumb_type = format!("{:?}", crumb.crumb_type).to_lowercase();
        lines.push(format!(
            "- `{}` **[{}]** {}",
            time, crumb_type, crumb.message
        ));
    }

    lines.join("\n")
}

/// Extract HH:MM:SS from an ISO timestamp.
fn format_time(iso: &str) -> String {
    // Try to extract time portion from ISO 8601 timestamp
    if let Some(t_pos) = iso.find('T') {
        let time_part = &iso[t_pos + 1..];
        if time_part.len() >= 8 {
            return time_part[..8].to_string();
        }
    }
    iso.to_string()
}

fn format_environment(env: &EnvironmentInfo) -> String {
    let mut lines = vec!["## Environment".to_string(), String::new()];

    let entries: Vec<(&str, Option<String>)> = vec![
        ("Deploy Environment", env.deploy.clone()),
        ("Framework", env.framework.clone()),
        ("Framework Version", env.framework_version.clone()),
        ("Runtime", env.runtime.clone()),
        ("Runtime Version", env.runtime_version.clone()),
        ("Platform", env.platform.clone()),
        (
            "Browser",
            env.browser.as_ref().map(|b| {
                format!(
                    "{} {}",
                    b,
                    env.browser_version.as_deref().unwrap_or("")
                )
                .trim()
                .to_string()
            }),
        ),
        ("OS", env.os.clone()),
        ("Device", env.device_type.clone()),
        ("Locale", env.locale.clone()),
        ("Timezone", env.timezone.clone()),
        ("URL", env.url.clone()),
    ];

    for (label, value) in entries {
        if let Some(v) = value {
            if !v.is_empty() {
                lines.push(format!("- **{}:** {}", label, v));
            }
        }
    }

    lines.join("\n")
}
