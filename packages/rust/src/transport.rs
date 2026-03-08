// ---------------------------------------------------------------------------
// uncaught — transport layer (console / local-file)
// ---------------------------------------------------------------------------

use std::fs;
use std::path::{Path, PathBuf};

use crate::types::*;

/// A transport implementation capable of delivering events.
pub trait Transport {
    fn send(&self, event: &UncaughtEvent);
    fn flush(&self);
}

/// Create the appropriate transport strategy based on config.
pub fn create_transport(config: &UncaughtConfig) -> Box<dyn Transport + Send + Sync> {
    match config.transport {
        TransportMode::Console => Box::new(ConsoleTransport),
        TransportMode::Remote => Box::new(ConsoleTransport), // TODO: implement remote
        TransportMode::Local => Box::new(LocalFileTransport::new(config)),
    }
}

// ===================================================================
// Console Transport
// ===================================================================

struct ConsoleTransport;

impl Transport for ConsoleTransport {
    fn send(&self, event: &UncaughtEvent) {
        let title = format!(
            "[uncaught] {}: {}",
            event.error.error_type, event.error.message
        );
        eprintln!("--- {} ---", title);
        eprintln!("Event ID: {}", event.event_id);
        eprintln!("Fingerprint: {}", event.fingerprint);
        if let Some(ref stack) = event.error.stack {
            eprintln!("Stack: {}", stack);
        }
        if !event.fix_prompt.is_empty() {
            eprintln!("Fix Prompt:\n{}", event.fix_prompt);
        }
        eprintln!("---");
    }

    fn flush(&self) {
        // Nothing to flush for console transport.
    }
}

// ===================================================================
// Local File Transport
// ===================================================================

struct LocalFileTransport {
    base_dir: PathBuf,
}

impl LocalFileTransport {
    fn new(config: &UncaughtConfig) -> Self {
        let base_dir = match &config.local_output_dir {
            Some(dir) => PathBuf::from(dir),
            None => {
                let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                cwd.join(".uncaught")
            }
        };

        // Ensure directory structure exists
        let _ = fs::create_dir_all(base_dir.join("events"));
        let _ = fs::create_dir_all(base_dir.join("fix-prompts"));

        // Auto-add .uncaught/ to .gitignore
        Self::ensure_gitignore(&base_dir);

        Self { base_dir }
    }

    fn ensure_gitignore(base_dir: &Path) {
        if let Some(parent) = base_dir.parent() {
            let gitignore_path = parent.join(".gitignore");
            let content = fs::read_to_string(&gitignore_path).unwrap_or_default();
            if !content.contains(".uncaught") {
                let line = "\n# Uncaught local error store\n.uncaught/\n";
                let _ = fs::write(
                    &gitignore_path,
                    format!("{}{}", content, line),
                );
            }
        }
    }
}

impl Transport for LocalFileTransport {
    fn send(&self, event: &UncaughtEvent) {
        let fp = &event.fingerprint;
        let event_dir = self.base_dir.join("events").join(fp);
        let _ = fs::create_dir_all(&event_dir);

        // Serialize event
        let json = match serde_json::to_string_pretty(event) {
            Ok(j) => j,
            Err(_) => return,
        };

        // Write timestamped event file (atomic: .tmp -> rename)
        let ts = event.timestamp.replace([':', '.'], "-");
        let event_file = format!("event-{}.json", ts);
        let event_path = event_dir.join(&event_file);
        let tmp_event_path = event_path.with_extension("json.tmp");
        if fs::write(&tmp_event_path, &json).is_ok() {
            let _ = fs::rename(&tmp_event_path, &event_path);
        }

        // Write / overwrite latest.json
        let latest_path = event_dir.join("latest.json");
        let tmp_latest_path = latest_path.with_extension("json.tmp");
        if fs::write(&tmp_latest_path, &json).is_ok() {
            let _ = fs::rename(&tmp_latest_path, &latest_path);
        }

        // Write fix-prompt Markdown file
        let prompt_file = format!("{}.md", fp);
        let prompt_path = self.base_dir.join("fix-prompts").join(&prompt_file);
        let tmp_prompt_path = prompt_path.with_extension("md.tmp");
        if fs::write(&tmp_prompt_path, &event.fix_prompt).is_ok() {
            let _ = fs::rename(&tmp_prompt_path, &prompt_path);
        }

        // Update issues.json index
        self.update_issues_index(event, &event_file, &prompt_file);
    }

    fn flush(&self) {
        // Local file transport writes synchronously per-event; nothing to flush.
    }
}

impl LocalFileTransport {
    fn update_issues_index(&self, event: &UncaughtEvent, event_file: &str, prompt_file: &str) {
        let index_path = self.base_dir.join("issues.json");

        let mut issues: Vec<IssueEntry> = fs::read_to_string(&index_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let user_id = event
            .user
            .as_ref()
            .and_then(|u| u.id.clone().or(u.email.clone()))
            .unwrap_or_else(|| "anonymous".to_string());

        if let Some(existing) = issues.iter_mut().find(|i| i.fingerprint == event.fingerprint) {
            existing.count += 1;
            existing.last_seen = event.timestamp.clone();
            existing.latest_event_file = event_file.to_string();
            existing.fix_prompt_file = prompt_file.to_string();
            if !existing.affected_users.contains(&user_id) {
                existing.affected_users.push(user_id);
            }
            if existing.status == IssueStatus::Resolved {
                existing.status = IssueStatus::Open;
            }
        } else {
            issues.push(IssueEntry {
                fingerprint: event.fingerprint.clone(),
                title: event.error.message.clone(),
                error_type: event.error.error_type.clone(),
                count: 1,
                affected_users: vec![user_id],
                first_seen: event.timestamp.clone(),
                last_seen: event.timestamp.clone(),
                status: IssueStatus::Open,
                fix_prompt_file: prompt_file.to_string(),
                latest_event_file: event_file.to_string(),
                release: event.release.clone(),
                environment: event.environment.as_ref().and_then(|e| e.deploy.clone()),
            });
        }

        // Atomic write
        let tmp_index_path = index_path.with_extension("json.tmp");
        if let Ok(json) = serde_json::to_string_pretty(&issues) {
            if fs::write(&tmp_index_path, &json).is_ok() {
                let _ = fs::rename(&tmp_index_path, &index_path);
            }
        }
    }
}
