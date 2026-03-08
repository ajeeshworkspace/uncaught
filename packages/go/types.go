// ---------------------------------------------------------------------------
// uncaught-go — shared type definitions
// ---------------------------------------------------------------------------

package uncaught

// TransportMode controls how captured events are delivered.
type TransportMode string

const (
	TransportRemote  TransportMode = "remote"
	TransportLocal   TransportMode = "local"
	TransportConsole TransportMode = "console"
)

// SeverityLevel mirrors syslog severity levels.
type SeverityLevel string

const (
	Fatal   SeverityLevel = "fatal"
	Error   SeverityLevel = "error"
	Warning SeverityLevel = "warning"
	Info    SeverityLevel = "info"
	Debug   SeverityLevel = "debug"
)

// IssueStatus represents the current status of a tracked issue.
type IssueStatus string

const (
	Open     IssueStatus = "open"
	Resolved IssueStatus = "resolved"
	Ignored  IssueStatus = "ignored"
)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Config is the configuration object passed to Init().
type Config struct {
	// ProjectKey used for authentication with the remote endpoint.
	ProjectKey string `json:"projectKey,omitempty"`

	// Endpoint is the remote ingestion endpoint URL. Required when transport is "remote".
	Endpoint string `json:"endpoint,omitempty"`

	// Environment is the deployment environment label (e.g. "production", "staging").
	Environment string `json:"environment,omitempty"`

	// Release is the release/version identifier.
	Release string `json:"release,omitempty"`

	// Debug enables internal debug logging when true.
	Debug bool `json:"debug,omitempty"`

	// Enabled is the master kill-switch. When false the SDK is completely inert. Defaults to true.
	Enabled *bool `json:"enabled,omitempty"`

	// MaxBreadcrumbs is the maximum number of breadcrumbs retained in the ring buffer. Defaults to 20.
	MaxBreadcrumbs int `json:"maxBreadcrumbs,omitempty"`

	// MaxEventsPerMinute is the rate-limit: max events per 60-second sliding window. Defaults to 30.
	MaxEventsPerMinute int `json:"maxEventsPerMinute,omitempty"`

	// BeforeSend is a lifecycle hook invoked just before an event is sent.
	// Return nil to discard the event.
	BeforeSend func(event *UncaughtEvent) *UncaughtEvent `json:"-"`

	// SanitizeKeys lists additional key patterns to redact during sanitization.
	SanitizeKeys []string `json:"sanitizeKeys,omitempty"`

	// IgnoreErrors lists string patterns. If the error message contains any of these, the event is dropped.
	IgnoreErrors []string `json:"ignoreErrors,omitempty"`

	// Transport strategy. Defaults to "local".
	Transport TransportMode `json:"transport,omitempty"`

	// LocalOutputDir is the directory used by the local-file transport.
	// Defaults to "./.uncaught".
	LocalOutputDir string `json:"localOutputDir,omitempty"`

	// WebhookURL is an optional URL to POST notifications when a new error fingerprint is first seen.
	WebhookURL string `json:"webhookUrl,omitempty"`
}

// isEnabled returns whether the SDK is enabled (defaults to true).
func (c *Config) isEnabled() bool {
	if c.Enabled == nil {
		return true
	}
	return *c.Enabled
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

// ErrorInfo is a structured representation of a captured error.
type ErrorInfo struct {
	Message        string      `json:"message"`
	Type           string      `json:"type"`
	Stack          string      `json:"stack,omitempty"`
	ResolvedStack  string      `json:"resolvedStack,omitempty"`
	ComponentStack string      `json:"componentStack,omitempty"`
	Raw            interface{} `json:"raw,omitempty"`
}

// RequestInfo contains contextual HTTP request information attached to an event.
type RequestInfo struct {
	Method  string            `json:"method,omitempty"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    interface{}       `json:"body,omitempty"`
	Query   map[string]string `json:"query,omitempty"`
}

// OperationInfo describes a failed external operation (DB, auth, API, etc.).
type OperationInfo struct {
	Provider     string                 `json:"provider"`
	Type         string                 `json:"type"`
	Method       string                 `json:"method"`
	Params       map[string]interface{} `json:"params,omitempty"`
	ErrorCode    string                 `json:"errorCode,omitempty"`
	ErrorDetails string                 `json:"errorDetails,omitempty"`
}

// UserInfo contains user context attached to events.
type UserInfo struct {
	ID       string                 `json:"id,omitempty"`
	Email    string                 `json:"email,omitempty"`
	Username string                 `json:"username,omitempty"`
	Extra    map[string]interface{} `json:"extra,omitempty"`
}

// SdkInfo contains SDK metadata shipped with every event.
type SdkInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// UncaughtEvent is the canonical event payload sent to transports.
type UncaughtEvent struct {
	EventID      string           `json:"eventId"`
	Timestamp    string           `json:"timestamp"`
	ProjectKey   string           `json:"projectKey,omitempty"`
	Level        SeverityLevel    `json:"level"`
	Fingerprint  string           `json:"fingerprint"`
	Release      string           `json:"release,omitempty"`
	Error        ErrorInfo        `json:"error"`
	Breadcrumbs  []Breadcrumb     `json:"breadcrumbs"`
	Request      *RequestInfo     `json:"request,omitempty"`
	Operation    *OperationInfo   `json:"operation,omitempty"`
	Environment  *EnvironmentInfo `json:"environment,omitempty"`
	User         *UserInfo        `json:"user,omitempty"`
	UserFeedback string           `json:"userFeedback,omitempty"`
	FixPrompt    string           `json:"fixPrompt"`
	SDK          SdkInfo          `json:"sdk"`
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

// BreadcrumbType categorises breadcrumbs.
type BreadcrumbType string

const (
	BreadcrumbClick      BreadcrumbType = "click"
	BreadcrumbNavigation BreadcrumbType = "navigation"
	BreadcrumbAPICall    BreadcrumbType = "api_call"
	BreadcrumbDBQuery    BreadcrumbType = "db_query"
	BreadcrumbAuth       BreadcrumbType = "auth"
	BreadcrumbConsole    BreadcrumbType = "console"
	BreadcrumbWebVital   BreadcrumbType = "web_vital"
	BreadcrumbCustom     BreadcrumbType = "custom"
)

// Breadcrumb is a single breadcrumb entry.
type Breadcrumb struct {
	Type      BreadcrumbType         `json:"type"`
	Category  string                 `json:"category"`
	Message   string                 `json:"message"`
	Timestamp string                 `json:"timestamp"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Level     SeverityLevel          `json:"level,omitempty"`
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// EnvironmentInfo contains detected runtime/platform information.
type EnvironmentInfo struct {
	Framework        string `json:"framework,omitempty"`
	FrameworkVersion string `json:"frameworkVersion,omitempty"`
	Runtime          string `json:"runtime,omitempty"`
	RuntimeVersion   string `json:"runtimeVersion,omitempty"`
	Platform         string `json:"platform,omitempty"`
	OS               string `json:"os,omitempty"`
	Browser          string `json:"browser,omitempty"`
	BrowserVersion   string `json:"browserVersion,omitempty"`
	DeviceType       string `json:"deviceType,omitempty"`
	Locale           string `json:"locale,omitempty"`
	Timezone         string `json:"timezone,omitempty"`
	URL              string `json:"url,omitempty"`
	Deploy           string `json:"deploy,omitempty"`
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

// Transport is the interface for delivering events.
type Transport interface {
	Send(event *UncaughtEvent) error
	Flush() error
}

// ---------------------------------------------------------------------------
// Local issues index
// ---------------------------------------------------------------------------

// IssueEntry represents an entry in the issues.json index file.
type IssueEntry struct {
	Fingerprint     string      `json:"fingerprint"`
	Title           string      `json:"title"`
	ErrorType       string      `json:"errorType"`
	Count           int         `json:"count"`
	AffectedUsers   []string    `json:"affectedUsers"`
	FirstSeen       string      `json:"firstSeen"`
	LastSeen        string      `json:"lastSeen"`
	Status          IssueStatus `json:"status"`
	FixPromptFile   string      `json:"fixPromptFile"`
	LatestEventFile string      `json:"latestEventFile"`
	Release         string      `json:"release,omitempty"`
	Environment     string      `json:"environment,omitempty"`
}

// CaptureContext provides additional context when capturing an error.
type CaptureContext struct {
	Request        *RequestInfo
	Operation      *OperationInfo
	ComponentStack string
	Level          SeverityLevel
}
