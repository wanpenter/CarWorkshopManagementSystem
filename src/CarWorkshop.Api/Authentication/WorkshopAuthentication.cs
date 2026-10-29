namespace CarWorkshop.Api.Authentication;

public static class WorkshopAuthentication
{
    public const string Scheme = "WorkshopCookie";
    public const string AdminPolicy = "WorkshopAdmin";
    public const string SessionIdClaim = "workshop:session-id";
}
