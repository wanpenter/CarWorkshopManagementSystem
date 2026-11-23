using System.Text.Json;

namespace CarWorkshop.Application.Contracts;

public sealed record AuditLogQuery(
    string? EntityType = null,
    string? Action = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 25);

public sealed record AuditLogDetails(
    long Id,
    int? UserId,
    string ActorUsername,
    string ActorRole,
    string Action,
    string EntityType,
    int? EntityId,
    string Summary,
    JsonElement? OldValues,
    JsonElement? NewValues,
    DateTime CreatedAtUtc);

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
