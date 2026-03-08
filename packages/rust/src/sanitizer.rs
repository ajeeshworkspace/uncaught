// ---------------------------------------------------------------------------
// uncaught — PII / secret sanitizer (deep walk via serde_json::Value)
// ---------------------------------------------------------------------------

use serde_json::Value;
use regex::Regex;
use std::sync::LazyLock;

/// Default key patterns that are always redacted.
const DEFAULT_SENSITIVE_KEYS: &[&str] = &[
    "password",
    "passwd",
    "secret",
    "token",
    "apikey",
    "api_key",
    "authorization",
    "credit_card",
    "creditcard",
    "card_number",
    "cvv",
    "ssn",
    "social_security",
    "private_key",
    "access_token",
    "refresh_token",
    "session_id",
    "cookie",
];

/// Headers that are always stripped regardless of key matching.
const SENSITIVE_HEADERS: &[&str] = &["authorization", "cookie", "set-cookie"];

const REDACTED: &str = "[REDACTED]";
const MAX_STRING_LENGTH: usize = 2048;

/// Build a regex pattern that matches any of the sensitive key patterns.
fn build_key_pattern(additional_keys: &[String]) -> Regex {
    let mut all: Vec<String> = DEFAULT_SENSITIVE_KEYS
        .iter()
        .map(|s| regex::escape(s))
        .collect();
    for key in additional_keys {
        all.push(regex::escape(key));
    }
    Regex::new(&format!("(?i){}", all.join("|"))).unwrap_or_else(|_| {
        // Fallback to a pattern that matches common sensitive keys
        Regex::new("(?i)password|secret|token|apikey|authorization").unwrap()
    })
}

static DEFAULT_PATTERN: LazyLock<Regex> = LazyLock::new(|| build_key_pattern(&[]));

/// Deep-clone and sanitise a serializable value, redacting values whose keys
/// match sensitive patterns.
///
/// - Truncates strings longer than 2048 characters.
/// - Never mutates the original value.
pub fn sanitize<T: serde::Serialize + serde::de::DeserializeOwned>(
    obj: T,
    additional_keys: &[String],
) -> T {
    let pattern = if additional_keys.is_empty() {
        DEFAULT_PATTERN.clone()
    } else {
        build_key_pattern(additional_keys)
    };

    // Convert to serde_json::Value for deep walking
    let value = match serde_json::to_value(&obj) {
        Ok(v) => v,
        Err(_) => return obj,
    };

    let sanitized = walk_value(value, None, &pattern);

    // Convert back to the original type
    serde_json::from_value(sanitized).unwrap_or(obj)
}

/// Recursively walk a serde_json::Value, redacting sensitive keys.
fn walk_value(value: Value, key: Option<&str>, pattern: &Regex) -> Value {
    // Redact if the current key is sensitive
    if let Some(k) = key {
        if pattern.is_match(k) {
            return Value::String(REDACTED.to_string());
        }
        // Always strip sensitive headers
        if SENSITIVE_HEADERS.contains(&k.to_lowercase().as_str()) {
            return Value::String(REDACTED.to_string());
        }
    }

    match value {
        Value::String(s) => {
            if s.len() > MAX_STRING_LENGTH {
                Value::String(format!("{}...[truncated]", &s[..MAX_STRING_LENGTH]))
            } else {
                Value::String(s)
            }
        }
        Value::Array(arr) => {
            let sanitized: Vec<Value> = arr
                .into_iter()
                .map(|item| walk_value(item, None, pattern))
                .collect();
            Value::Array(sanitized)
        }
        Value::Object(map) => {
            let mut result = serde_json::Map::new();
            for (k, v) in map {
                result.insert(k.clone(), walk_value(v, Some(&k), pattern));
            }
            Value::Object(result)
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;

    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct TestObj {
        name: String,
        password: String,
        data: HashMap<String, String>,
    }

    #[test]
    fn test_sanitize_redacts_password() {
        let obj = TestObj {
            name: "test".to_string(),
            password: "super_secret".to_string(),
            data: HashMap::new(),
        };

        let sanitized: TestObj = sanitize(obj, &[]);
        assert_eq!(sanitized.name, "test");
        assert_eq!(sanitized.password, REDACTED);
    }

    #[test]
    fn test_sanitize_custom_keys() {
        let mut data = HashMap::new();
        data.insert("my_custom_field".to_string(), "value".to_string());
        data.insert("normal".to_string(), "visible".to_string());

        let obj = TestObj {
            name: "test".to_string(),
            password: "secret".to_string(),
            data,
        };

        let sanitized: TestObj = sanitize(obj, &["my_custom_field".to_string()]);
        assert_eq!(sanitized.data.get("my_custom_field").unwrap(), REDACTED);
        assert_eq!(sanitized.data.get("normal").unwrap(), "visible");
    }

    #[test]
    fn test_truncates_long_strings() {
        let long_string = "x".repeat(3000);
        let obj = TestObj {
            name: long_string,
            password: "secret".to_string(),
            data: HashMap::new(),
        };

        let sanitized: TestObj = sanitize(obj, &[]);
        assert!(sanitized.name.len() < 3000);
        assert!(sanitized.name.ends_with("...[truncated]"));
    }
}
