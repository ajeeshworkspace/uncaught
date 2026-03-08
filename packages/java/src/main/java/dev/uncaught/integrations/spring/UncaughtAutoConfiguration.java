// ---------------------------------------------------------------------------
// dev.uncaught — Spring Boot auto-configuration
// ---------------------------------------------------------------------------

package dev.uncaught.integrations.spring;

import dev.uncaught.Config;
import dev.uncaught.Uncaught;
import dev.uncaught.UncaughtClient;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring Boot auto-configuration for the Uncaught Java SDK.
 * <p>
 * Automatically registers:
 * <ul>
 *   <li>An {@link UncaughtClient} bean (initialised via {@link Uncaught#init})</li>
 *   <li>An {@link UncaughtFilter} servlet filter that captures unhandled exceptions</li>
 * </ul>
 * <p>
 * Activated only when Jakarta Servlet API is on the classpath.
 */
@Configuration
@ConditionalOnClass(name = "jakarta.servlet.Filter")
public class UncaughtAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public UncaughtClient uncaughtClient() {
        return Uncaught.init(new Config());
    }

    @Bean
    public UncaughtFilter uncaughtFilter(UncaughtClient client) {
        return new UncaughtFilter(client);
    }
}
