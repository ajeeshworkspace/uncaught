// ---------------------------------------------------------------------------
// dev.uncaught — runtime / platform environment detector
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.Locale;
import java.util.TimeZone;

/**
 * Detect the current runtime environment (Java version, OS, Spring if present).
 * <p>
 * The result is cached after the first invocation.
 */
public final class EnvironmentDetector {

    private EnvironmentDetector() { /* utility class */ }

    /** Cached result so detection only runs once per JVM. */
    private static volatile Types.EnvironmentInfo cached;

    /**
     * Detect the current runtime environment.
     *
     * @return populated {@link Types.EnvironmentInfo}
     */
    public static Types.EnvironmentInfo detect() {
        Types.EnvironmentInfo local = cached;
        if (local != null) return local;

        synchronized (EnvironmentDetector.class) {
            if (cached != null) return cached;

            Types.EnvironmentInfo info = new Types.EnvironmentInfo();

            try {
                // ----- Runtime ---------------------------------------------------
                info.setRuntime("java");
                info.setRuntimeVersion(System.getProperty("java.version", "unknown"));

                // ----- OS --------------------------------------------------------
                String osName = System.getProperty("os.name", "");
                info.setOs(normaliseOsName(osName));
                info.setPlatform(System.getProperty("os.arch", "unknown"));

                // ----- Locale / Timezone -----------------------------------------
                Locale locale = Locale.getDefault();
                if (locale != null) {
                    info.setLocale(locale.toLanguageTag());
                }
                TimeZone tz = TimeZone.getDefault();
                if (tz != null) {
                    info.setTimezone(tz.getID());
                }

                // ----- Framework detection: Spring Boot --------------------------
                detectSpring(info);

                // ----- Framework detection: Micronaut ----------------------------
                detectMicronaut(info);

                // ----- Framework detection: Quarkus ------------------------------
                detectQuarkus(info);

            } catch (Exception e) {
                // Silent — environment detection must never throw.
            }

            cached = info;
            return info;
        }
    }

    /**
     * Reset the cached environment (useful for testing).
     */
    public static void resetCache() {
        cached = null;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static String normaliseOsName(String osName) {
        if (osName == null || osName.isEmpty()) return "unknown";
        String lower = osName.toLowerCase(Locale.ENGLISH);
        if (lower.startsWith("mac")) return "macOS";
        if (lower.startsWith("win")) return "Windows";
        if (lower.contains("linux")) return "Linux";
        if (lower.contains("freebsd")) return "FreeBSD";
        return osName;
    }

    /**
     * Detect Spring Boot by checking if SpringApplication class is on the classpath.
     */
    private static void detectSpring(Types.EnvironmentInfo info) {
        try {
            Class<?> springBootClass = Class.forName(
                    "org.springframework.boot.SpringApplication", false,
                    Thread.currentThread().getContextClassLoader());
            if (springBootClass != null) {
                info.setFramework("spring-boot");
                // Try to get Spring Boot version
                try {
                    Class<?> versionClass = Class.forName(
                            "org.springframework.boot.SpringBootVersion", false,
                            Thread.currentThread().getContextClassLoader());
                    Object version = versionClass.getMethod("getVersion").invoke(null);
                    if (version instanceof String) {
                        info.setFrameworkVersion((String) version);
                    }
                } catch (Exception e) {
                    // Version detection is optional
                }
            }
        } catch (ClassNotFoundException e) {
            // Spring Boot not on classpath — that's fine.
        }
    }

    /**
     * Detect Micronaut by checking for Application class.
     */
    private static void detectMicronaut(Types.EnvironmentInfo info) {
        if (info.getFramework() != null) return; // already detected
        try {
            Class.forName("io.micronaut.runtime.Micronaut", false,
                    Thread.currentThread().getContextClassLoader());
            info.setFramework("micronaut");
        } catch (ClassNotFoundException e) {
            // Not on classpath
        }
    }

    /**
     * Detect Quarkus by checking for Quarkus class.
     */
    private static void detectQuarkus(Types.EnvironmentInfo info) {
        if (info.getFramework() != null) return; // already detected
        try {
            Class.forName("io.quarkus.runtime.Quarkus", false,
                    Thread.currentThread().getContextClassLoader());
            info.setFramework("quarkus");
        } catch (ClassNotFoundException e) {
            // Not on classpath
        }
    }
}
