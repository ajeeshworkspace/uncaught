// ---------------------------------------------------------------------------
// uncaught — error fingerprinting (DJB2)
// ---------------------------------------------------------------------------

use regex::Regex;
use std::sync::LazyLock;

/// Generate a stable fingerprint for an error so that duplicate occurrences
/// of the same bug are grouped together.
///
/// The fingerprint is an 8-character hex string derived from:
///  1. The normalised error message (volatile parts stripped).
///  2. The top 3 stack frames (file + function name, no line/col numbers).
pub fn generate_fingerprint(error_type: &str, message: &str, stack: Option<&str>) -> String {
    let normalised_message = normalise_message(message);
    let frames = extract_top_frames(stack.unwrap_or(""), 3);

    let mut input = format!("{}\n{}", error_type, normalised_message);
    for frame in &frames {
        input.push('\n');
        input.push_str(frame);
    }

    djb2(&input)
}

/// DJB2 hash -> 8-character lowercase hex string.
///
/// Uses i32 wrapping arithmetic to produce identical results to the
/// TypeScript reference implementation.
pub fn djb2(s: &str) -> String {
    let mut hash: i32 = 5381;
    for c in s.chars() {
        hash = hash.wrapping_mul(33).wrapping_add(c as i32);
    }
    format!("{:08x}", hash as u32)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

static RE_UUID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").unwrap()
});

static RE_HEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b[0-9a-f]{8,}\b").unwrap()
});

static RE_NUM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b\d{4,}\b").unwrap()
});

static RE_TIMESTAMP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?").unwrap()
});

static RE_HASHED_FILE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([/\\])[a-zA-Z0-9_-]+[-.][a-f0-9]{6,}\.(js|ts|mjs|cjs|jsx|tsx)").unwrap()
});

/// Strip volatile substrings from an error message so that trivially-different
/// occurrences of the same bug hash identically.
fn normalise_message(msg: &str) -> String {
    let result = RE_UUID.replace_all(msg, "<UUID>");
    let result = RE_HEX.replace_all(&result, "<HEX>");
    let result = RE_NUM.replace_all(&result, "<NUM>");
    let result = RE_TIMESTAMP.replace_all(&result, "<TIMESTAMP>");
    let result = RE_HASHED_FILE.replace_all(&result, "$1<FILE>.$2");
    result.trim().to_string()
}

/// Extract the top N stack frames as normalised "file:function" strings.
fn extract_top_frames(stack: &str, count: usize) -> Vec<String> {
    if stack.is_empty() {
        return vec![];
    }

    let re_rust_frame = Regex::new(
        r"^\s*\d+:\s+(?:0x[0-9a-f]+\s+-\s+)?(.+?)(?:::(.+?))?$"
    ).unwrap();

    let re_v8 = Regex::new(
        r"at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?"
    ).unwrap();

    let mut frames = Vec::new();

    for line in stack.lines() {
        if frames.len() >= count {
            break;
        }

        let trimmed = line.trim();

        // Rust backtrace format: "  N: module::function"
        if let Some(caps) = re_rust_frame.captures(trimmed) {
            let module = caps.get(1).map(|m| m.as_str()).unwrap_or("<unknown>");
            let func = caps.get(2).map(|m| m.as_str()).unwrap_or("<anonymous>");
            let normalised = normalise_path(module);
            frames.push(format!("{}:{}", normalised, func));
            continue;
        }

        // V8 format: "    at FunctionName (file:line:col)"
        if let Some(caps) = re_v8.captures(trimmed) {
            let func = caps.get(1).map(|m| m.as_str()).unwrap_or("<anonymous>");
            let file = caps.get(2).map(|m| m.as_str()).unwrap_or("<unknown>");
            let normalised = normalise_path(file);
            frames.push(format!("{}:{}", normalised, func));
            continue;
        }
    }

    frames
}

/// Normalise a file path by stripping query strings / hashes and collapsing
/// absolute filesystem prefixes.
fn normalise_path(p: &str) -> String {
    let re_query = Regex::new(r"[?#].*$").unwrap();
    let re_node_modules = Regex::new(r"^.*/node_modules/").unwrap();
    let re_origin = Regex::new(r"^https?://[^/]+").unwrap();
    let re_dir = Regex::new(r"^.*[/\\]").unwrap();

    let result = re_query.replace(p, "");
    let result = re_node_modules.replace(&result, "node_modules/");
    let result = re_origin.replace(&result, "");
    let result = re_dir.replace(&result, "");
    result.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_djb2_basic() {
        // Verify the hash function produces consistent results
        let hash1 = djb2("hello");
        let hash2 = djb2("hello");
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 8);
    }

    #[test]
    fn test_djb2_empty() {
        let hash = djb2("");
        assert_eq!(hash, "00001505"); // 5381 in hex = 0x1505
    }

    #[test]
    fn test_fingerprint_stability() {
        let fp1 = generate_fingerprint("Error", "test error", None);
        let fp2 = generate_fingerprint("Error", "test error", None);
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn test_normalise_message_strips_uuids() {
        let msg = "User 550e8400-e29b-41d4-a716-446655440000 not found";
        let normalised = normalise_message(msg);
        assert!(normalised.contains("<UUID>"));
        assert!(!normalised.contains("550e8400"));
    }
}
