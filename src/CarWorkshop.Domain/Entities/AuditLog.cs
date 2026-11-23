namespace CarWorkshop.Domain.Entities;

public sealed class AuditLog
{
    public const int MaxActorUsernameLength = 50;
    public const int MaxActorRoleLength = 20;
    public const int MaxActionLength = 60;
    public const int MaxEntityTypeLength = 50;
    public const int MaxSummaryLength = 300;

    private AuditLog()
    {
    }

    private AuditLog(
        int? userId,
        string actorUsername,
        string actorRole,
        string action,
        string entityType,
        int? entityId,
        string summary,
        string? oldValuesJson,
        string? newValuesJson,
        DateTime createdAtUtc)
    {
        if (userId.HasValue && userId.Value <= 0)
            throw new ArgumentOutOfRangeException(nameof(userId), "User ID must be positive when provided.");

        if (entityId.HasValue && entityId.Value <= 0)
            throw new ArgumentOutOfRangeException(nameof(entityId), "Entity ID must be positive when provided.");

        if (createdAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Audit log timestamp must be UTC.", nameof(createdAtUtc));

        UserId = userId;
        ActorUsername = RequiredBounded(actorUsername, MaxActorUsernameLength, nameof(actorUsername));
        ActorRole = RequiredBounded(actorRole, MaxActorRoleLength, nameof(actorRole));
        Action = RequiredBounded(action, MaxActionLength, nameof(action));
        EntityType = RequiredBounded(entityType, MaxEntityTypeLength, nameof(entityType));
        EntityId = entityId;
        Summary = RequiredBounded(summary, MaxSummaryLength, nameof(summary));
        OldValuesJson = string.IsNullOrWhiteSpace(oldValuesJson) ? null : oldValuesJson;
        NewValuesJson = string.IsNullOrWhiteSpace(newValuesJson) ? null : newValuesJson;
        CreatedAtUtc = createdAtUtc;
    }

    public long Id { get; private set; }

    public int? UserId { get; private set; }

    public string ActorUsername { get; private set; } = string.Empty;

    public string ActorRole { get; private set; } = string.Empty;

    public string Action { get; private set; } = string.Empty;

    public string EntityType { get; private set; } = string.Empty;

    public int? EntityId { get; private set; }

    public string Summary { get; private set; } = string.Empty;

    public string? OldValuesJson { get; private set; }

    public string? NewValuesJson { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public WorkshopUser? User { get; private set; }

    public static AuditLog Create(
        int? userId,
        string actorUsername,
        string actorRole,
        string action,
        string entityType,
        int? entityId,
        string summary,
        string? oldValuesJson,
        string? newValuesJson,
        DateTime createdAtUtc)
    {
        return new AuditLog(
            userId,
            actorUsername,
            actorRole,
            action,
            entityType,
            entityId,
            summary,
            oldValuesJson,
            newValuesJson,
            createdAtUtc);
    }

    private static string RequiredBounded(string value, int maxLength, string parameterName)
    {
        ArgumentNullException.ThrowIfNull(value, parameterName);
        var trimmed = value.Trim();
        if (trimmed.Length == 0)
            throw new ArgumentException("Value is required.", parameterName);

        if (trimmed.Length > maxLength)
            throw new ArgumentException($"Value cannot exceed {maxLength} characters.", parameterName);

        return trimmed;
    }
}
