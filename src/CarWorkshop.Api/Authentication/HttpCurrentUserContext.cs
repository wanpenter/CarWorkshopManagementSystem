using System.Security.Claims;
using CarWorkshop.Application.Interfaces;

namespace CarWorkshop.Api.Authentication;

public sealed class HttpCurrentUserContext(IHttpContextAccessor httpContextAccessor) : ICurrentUserContext
{
    public CurrentActor GetCurrentActor()
    {
        var principal = httpContextAccessor.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated != true)
            return CurrentActor.System;

        var idClaim = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var userId = int.TryParse(idClaim, out var parsedId) && parsedId > 0 ? parsedId : (int?)null;
        var username = principal.FindFirstValue(ClaimTypes.Name);
        var role = principal.FindFirstValue(ClaimTypes.Role);

        return new CurrentActor(
            userId,
            string.IsNullOrWhiteSpace(username) ? "unknown" : username,
            string.IsNullOrWhiteSpace(role) ? "Unknown" : role);
    }
}
