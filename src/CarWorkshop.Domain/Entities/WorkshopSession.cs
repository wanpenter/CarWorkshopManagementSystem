namespace CarWorkshop.Domain.Entities;

public sealed class WorkshopSession
{
    private WorkshopSession()
    {
    }

    private WorkshopSession(int workshopUserId, DateTime createdAtUtc, DateTime expiresAtUtc)
    {
        Id = Guid.NewGuid().ToString("N");
        WorkshopUserId = workshopUserId;
        CreatedAtUtc = EnsureUtc(createdAtUtc, nameof(createdAtUtc));
        ExpiresAtUtc = EnsureUtc(expiresAtUtc, nameof(expiresAtUtc));

        if (ExpiresAtUtc <= CreatedAtUtc)
        {
            throw new ArgumentException("Session expiry must be after its creation time.", nameof(expiresAtUtc));
        }
    }

    public string Id { get; private set; } = string.Empty;

    public int WorkshopUserId { get; private set; }

    public WorkshopUser WorkshopUser { get; private set; } = null!;

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime ExpiresAtUtc { get; private set; }

    public DateTime? RevokedAtUtc { get; private set; }

    public static WorkshopSession Create(int workshopUserId, DateTime createdAtUtc, DateTime expiresAtUtc)
    {
        return new WorkshopSession(workshopUserId, createdAtUtc, expiresAtUtc);
    }

    public void Revoke(DateTime revokedAtUtc)
    {
        RevokedAtUtc ??= EnsureUtc(revokedAtUtc, nameof(revokedAtUtc));
    }

    public bool IsValidAt(DateTime nowUtc)
    {
        nowUtc = EnsureUtc(nowUtc, nameof(nowUtc));
        return RevokedAtUtc is null && ExpiresAtUtc > nowUtc;
    }

    private static DateTime EnsureUtc(DateTime value, string parameterName)
    {
        if (value.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Time must be UTC.", parameterName);
        }

        return value;
    }
}
