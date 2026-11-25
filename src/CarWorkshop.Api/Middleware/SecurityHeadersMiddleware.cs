using System.Text.RegularExpressions;

namespace CarWorkshop.Api.Middleware;

public sealed partial class SecurityHeadersMiddleware(
    RequestDelegate next,
    ILogger<SecurityHeadersMiddleware> logger)
{
    public const string RequestIdHeaderName = "X-Request-Id";

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = ResolveRequestId(context.Request.Headers[RequestIdHeaderName].FirstOrDefault());
        context.TraceIdentifier = requestId;

        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers[RequestIdHeaderName] = requestId;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            return Task.CompletedTask;
        });

        using (logger.BeginScope(new Dictionary<string, object> { ["RequestId"] = requestId }))
        {
            await next(context);
        }
    }

    private static string ResolveRequestId(string? incoming)
    {
        if (!string.IsNullOrWhiteSpace(incoming))
        {
            var trimmed = incoming.Trim();
            if (SafeRequestIdRegex().IsMatch(trimmed))
                return trimmed;
        }

        return Guid.NewGuid().ToString("N")[..16];
    }

    [GeneratedRegex("^[A-Za-z0-9._-]{1,64}$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeRequestIdRegex();
}
