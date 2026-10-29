using System.Security.Claims;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Api.Authentication;

public sealed class WorkshopCookieEvents(
    CarWorkshopDbContext db,
    TimeProvider timeProvider) : CookieAuthenticationEvents
{
    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    {
        return WriteProblemAsync(context, StatusCodes.Status401Unauthorized, "Unauthorized",
            "Authentication is required.");
    }

    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
    {
        return WriteProblemAsync(context, StatusCodes.Status403Forbidden, "Forbidden",
            "You do not have permission to perform this action.");
    }

    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var userIdValue = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var sessionIdValue = context.Principal?.FindFirstValue(WorkshopAuthentication.SessionIdClaim);

        if (!int.TryParse(userIdValue, out var userId) ||
            string.IsNullOrWhiteSpace(sessionIdValue))
        {
            await RejectAsync(context);
            return;
        }

        var session = await db.WorkshopSessions
            .AsNoTracking()
            .Include(item => item.WorkshopUser)
            .SingleOrDefaultAsync(item => item.Id == sessionIdValue, context.HttpContext.RequestAborted);
        var now = timeProvider.GetUtcNow().UtcDateTime;

        if (session is null ||
            session.WorkshopUserId != userId ||
            !session.WorkshopUser.IsActive ||
            !session.IsValidAt(now))
        {
            await RejectAsync(context);
        }
    }

    private static async Task RejectAsync(CookieValidatePrincipalContext context)
    {
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(WorkshopAuthentication.Scheme);
    }

    private static Task WriteProblemAsync(
        RedirectContext<CookieAuthenticationOptions> context,
        int status,
        string title,
        string detail)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Instance = context.Request.Path
        });
    }
}
