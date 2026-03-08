// ---------------------------------------------------------------------------
// dev.uncaught — Jakarta Servlet Filter for Spring Boot
// ---------------------------------------------------------------------------

package dev.uncaught.integrations.spring;

import dev.uncaught.Types;
import dev.uncaught.UncaughtClient;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;

/**
 * A Jakarta Servlet {@link Filter} that captures unhandled exceptions passing
 * through the filter chain and reports them to the Uncaught SDK.
 * <p>
 * Automatically registered by {@link UncaughtAutoConfiguration} when Spring Boot
 * is present.
 *
 * <h3>What it does</h3>
 * <ol>
 *   <li>Adds a navigation breadcrumb for every incoming request.</li>
 *   <li>Wraps {@code chain.doFilter()} in a try/catch.</li>
 *   <li>On exception, extracts HTTP request context (method, URL, headers)
 *       and calls {@link UncaughtClient#captureError}.</li>
 *   <li>Re-throws the exception so the container can still handle it.</li>
 * </ol>
 */
public class UncaughtFilter implements Filter {

    private final UncaughtClient client;

    public UncaughtFilter(UncaughtClient client) {
        this.client = client;
    }

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
        // No initialisation needed.
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse,
                         FilterChain chain) throws IOException, ServletException {
        if (!(servletRequest instanceof HttpServletRequest)) {
            chain.doFilter(servletRequest, servletResponse);
            return;
        }

        HttpServletRequest httpRequest = (HttpServletRequest) servletRequest;

        // --- Add navigation breadcrumb ---
        String method = httpRequest.getMethod();
        String uri = httpRequest.getRequestURI();
        String queryString = httpRequest.getQueryString();
        String fullUrl = queryString != null ? uri + "?" + queryString : uri;

        client.addBreadcrumb(
                Types.BREADCRUMB_NAVIGATION,
                "http",
                method + " " + fullUrl
        );

        try {
            chain.doFilter(servletRequest, servletResponse);
        } catch (Exception e) {
            // --- Extract request context ---
            Types.RequestInfo requestInfo = extractRequestInfo(httpRequest);

            // --- Capture the error ---
            client.captureError(e, new UncaughtClient.CaptureContext()
                    .request(requestInfo)
                    .level(Types.LEVEL_ERROR));

            // Re-throw so the servlet container can handle it normally
            if (e instanceof IOException) {
                throw (IOException) e;
            }
            if (e instanceof ServletException) {
                throw (ServletException) e;
            }
            if (e instanceof RuntimeException) {
                throw (RuntimeException) e;
            }
            throw new ServletException(e);
        }
    }

    @Override
    public void destroy() {
        // No cleanup needed.
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Extract HTTP request information from the servlet request.
     * Sensitive headers (Authorization, Cookie) are handled by the
     * sanitiser downstream.
     */
    private static Types.RequestInfo extractRequestInfo(HttpServletRequest request) {
        Types.RequestInfo info = new Types.RequestInfo();

        info.setMethod(request.getMethod());

        // Build full URL
        StringBuffer requestUrl = request.getRequestURL();
        String queryString = request.getQueryString();
        if (queryString != null) {
            requestUrl.append('?').append(queryString);
        }
        info.setUrl(requestUrl.toString());

        // Extract headers
        Map<String, String> headers = new HashMap<>();
        Enumeration<String> headerNames = request.getHeaderNames();
        if (headerNames != null) {
            while (headerNames.hasMoreElements()) {
                String name = headerNames.nextElement();
                headers.put(name, request.getHeader(name));
            }
        }
        info.setHeaders(headers);

        // Extract query parameters
        Map<String, String> query = new HashMap<>();
        Enumeration<String> paramNames = request.getParameterNames();
        if (paramNames != null) {
            while (paramNames.hasMoreElements()) {
                String name = paramNames.nextElement();
                query.put(name, request.getParameter(name));
            }
        }
        if (!query.isEmpty()) {
            info.setQuery(query);
        }

        return info;
    }
}
