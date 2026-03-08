// ---------------------------------------------------------------------------
// Uncaught — PII / secret sanitizer (deep walk via JsonElement)
// ---------------------------------------------------------------------------

using System.Text.Json;
using System.Text.RegularExpressions;

namespace Uncaught;

/// <summary>
/// Deep-walks JSON structures and redacts values whose keys match sensitive patterns.
/// </summary>
public static class Sanitizer
{
    private static readonly string[] DefaultSensitiveKeys =
    {
        "password", "passwd", "secret", "token", "apikey", "api_key",
        "authorization", "credit_card", "creditcard", "card_number",
        "cvv", "ssn", "social_security", "private_key",
        "access_token", "refresh_token", "session_id", "cookie"
    };

    private static readonly HashSet<string> SensitiveHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "authorization", "cookie", "set-cookie"
    };

    private const string Redacted = "[REDACTED]";
    private const int MaxStringLength = 2048;

    /// <summary>
    /// Sanitize an UncaughtEvent by serializing to JSON, walking, and deserializing back.
    /// </summary>
    public static UncaughtEvent Sanitize(UncaughtEvent ev, List<string> additionalKeys)
    {
        try
        {
            var pattern = BuildKeyPattern(additionalKeys);
            var json = JsonSerializer.Serialize(ev, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            });

            using var doc = JsonDocument.Parse(json);
            var sanitized = WalkElement(doc.RootElement, null, pattern);
            var sanitizedJson = sanitized.GetRawText();

            return JsonSerializer.Deserialize<UncaughtEvent>(sanitizedJson, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            }) ?? ev;
        }
        catch
        {
            return ev;
        }
    }

    private static Regex BuildKeyPattern(List<string> additionalKeys)
    {
        var all = DefaultSensitiveKeys.Concat(additionalKeys)
            .Select(Regex.Escape);
        return new Regex(string.Join("|", all), RegexOptions.IgnoreCase);
    }

    private static JsonElement WalkElement(JsonElement element, string? key, Regex pattern)
    {
        // Redact if the current key is sensitive
        if (key != null && pattern.IsMatch(key))
        {
            return CreateStringElement(Redacted);
        }

        // Always strip sensitive headers
        if (key != null && SensitiveHeaders.Contains(key))
        {
            return CreateStringElement(Redacted);
        }

        switch (element.ValueKind)
        {
            case JsonValueKind.String:
            {
                var str = element.GetString() ?? "";
                if (str.Length > MaxStringLength)
                {
                    return CreateStringElement(str[..MaxStringLength] + "...[truncated]");
                }
                return element;
            }

            case JsonValueKind.Array:
            {
                using var stream = new MemoryStream();
                using (var writer = new Utf8JsonWriter(stream))
                {
                    writer.WriteStartArray();
                    foreach (var item in element.EnumerateArray())
                    {
                        WalkElement(item, null, pattern).WriteTo(writer);
                    }
                    writer.WriteEndArray();
                }
                return JsonDocument.Parse(stream.ToArray()).RootElement.Clone();
            }

            case JsonValueKind.Object:
            {
                using var stream = new MemoryStream();
                using (var writer = new Utf8JsonWriter(stream))
                {
                    writer.WriteStartObject();
                    foreach (var prop in element.EnumerateObject())
                    {
                        writer.WritePropertyName(prop.Name);
                        WalkElement(prop.Value, prop.Name, pattern).WriteTo(writer);
                    }
                    writer.WriteEndObject();
                }
                return JsonDocument.Parse(stream.ToArray()).RootElement.Clone();
            }

            default:
                return element;
        }
    }

    private static JsonElement CreateStringElement(string value)
    {
        var json = JsonSerializer.Serialize(value);
        return JsonDocument.Parse(json).RootElement.Clone();
    }
}
