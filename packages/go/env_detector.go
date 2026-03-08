// ---------------------------------------------------------------------------
// uncaught-go — runtime / platform environment detector
// ---------------------------------------------------------------------------

package uncaught

import (
	"os"
	"runtime"
	"sync"
)

var (
	envOnce   sync.Once
	envCached *EnvironmentInfo
)

// DetectEnvironment detects the current Go runtime environment.
// The result is cached after the first invocation.
func DetectEnvironment() *EnvironmentInfo {
	envOnce.Do(func() {
		envCached = detectEnv()
	})
	return envCached
}

// ResetEnvironmentCache resets the cached environment (useful for testing).
func ResetEnvironmentCache() {
	envOnce = sync.Once{}
	envCached = nil
}

func detectEnv() *EnvironmentInfo {
	info := &EnvironmentInfo{}

	// Runtime
	info.Runtime = "go"
	info.RuntimeVersion = runtime.Version()
	info.Platform = runtime.GOOS + "/" + runtime.GOARCH

	// OS detection
	switch runtime.GOOS {
	case "darwin":
		info.OS = "macOS"
	case "windows":
		info.OS = "Windows"
	case "linux":
		info.OS = "Linux"
	case "freebsd":
		info.OS = "FreeBSD"
	default:
		info.OS = runtime.GOOS
	}

	// Framework detection via environment variables
	detectGoFramework(info)

	// Hosting platform markers
	detectPlatform(info)

	return info
}

func detectGoFramework(info *EnvironmentInfo) {
	// Detect common Go web frameworks via well-known env vars
	// (frameworks don't usually set env vars, so this is best-effort)
	if os.Getenv("GIN_MODE") != "" {
		info.Framework = "gin"
	}
}

func detectPlatform(info *EnvironmentInfo) {
	if os.Getenv("VERCEL") != "" {
		info.Platform = "vercel"
	} else if os.Getenv("RAILWAY_PROJECT_ID") != "" {
		info.Platform = "railway"
	} else if os.Getenv("FLY_APP_NAME") != "" {
		info.Platform = "fly"
	} else if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		info.Platform = "aws-lambda"
	} else if os.Getenv("GOOGLE_CLOUD_PROJECT") != "" {
		info.Platform = "gcp"
	} else if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		info.Platform = "kubernetes"
	}
}
