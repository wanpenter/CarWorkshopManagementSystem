using CarWorkshop.Application.Exceptions;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Middleware;

public sealed class ApiExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ApiExceptionMiddleware> _logger;

    public ApiExceptionMiddleware(RequestDelegate next, ILogger<ApiExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (EntityNotFoundException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status404NotFound, "Not found", exception.Message);
        }
        catch (ConflictException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status409Conflict, "Conflict", exception.Message);
        }
        catch (ArgumentException exception)
        {
            var key = ToCamelCase(exception.ParamName ?? "request");
            await WriteValidationProblemAsync(context, key, exception.Message);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Unhandled error while processing {Method} {Path}",
                context.Request.Method,
                context.Request.Path);

            await WriteProblemAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "Server error",
                "An unexpected error occurred.");
        }
    }

    private static Task WriteProblemAsync(
        HttpContext context,
        int status,
        string title,
        string detail)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Status = status,
                Title = title,
                Detail = detail,
                Instance = context.Request.Path
            },
            cancellationToken: context.RequestAborted);
    }

    private static Task WriteValidationProblemAsync(HttpContext context, string key, string error)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return context.Response.WriteAsJsonAsync(
            new ValidationProblemDetails(new Dictionary<string, string[]>
            {
                [key] = [error.Split(" (Parameter", StringSplitOptions.None)[0]]
            })
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Validation failed",
                Instance = context.Request.Path
            },
            cancellationToken: context.RequestAborted);
    }

    internal static string ToCamelCase(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        if (value.StartsWith("$.", StringComparison.Ordinal) && value.Length > 2)
        {
            return "$." + char.ToLowerInvariant(value[2]) + value[3..];
        }

        return char.ToLowerInvariant(value[0]) + value[1..];
    }
}
