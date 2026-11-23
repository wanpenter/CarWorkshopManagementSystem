using System.Text.Json;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class AuditLogService(
    IAuditLogRepository auditLogs,
    IUnitOfWork unitOfWork,
    ICurrentUserContext currentUserContext,
    TimeProvider timeProvider)
{
    public const int DefaultPageSize = 25;
    public const int MaxPageSize = 100;

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task StageAsync(
        string action,
        string entityType,
        int? entityId,
        string summary,
        object? oldValues = null,
        object? newValues = null,
        CurrentActor? actorOverride = null,
        CancellationToken cancellationToken = default)
    {
        var actor = actorOverride ?? currentUserContext.GetCurrentActor();
        var entry = AuditLog.Create(
            actor.UserId,
            Truncate(actor.Username, AuditLog.MaxActorUsernameLength, "system"),
            Truncate(actor.Role, AuditLog.MaxActorRoleLength, "System"),
            Truncate(action, AuditLog.MaxActionLength, "Unknown"),
            Truncate(entityType, AuditLog.MaxEntityTypeLength, "Unknown"),
            entityId,
            Truncate(summary, AuditLog.MaxSummaryLength, action),
            SerializeOrNull(oldValues),
            SerializeOrNull(newValues),
            timeProvider.GetUtcNow().UtcDateTime);

        await auditLogs.AddAsync(entry, cancellationToken);
    }

    public async Task RecordAsync(
        string action,
        string entityType,
        int? entityId,
        string summary,
        object? oldValues = null,
        object? newValues = null,
        CurrentActor? actorOverride = null,
        CancellationToken cancellationToken = default)
    {
        await StageAsync(
            action,
            entityType,
            entityId,
            summary,
            oldValues,
            newValues,
            actorOverride,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<PagedResult<AuditLogDetails>> GetPageAsync(
        AuditLogQuery query,
        CancellationToken cancellationToken = default)
    {
        if (query.Page < 1)
            throw new ArgumentOutOfRangeException(nameof(query), "Page must be 1 or greater.");

        if (query.PageSize is < 1 or > MaxPageSize)
            throw new ArgumentOutOfRangeException(nameof(query), $"Page size must be between 1 and {MaxPageSize}.");

        var normalized = query with
        {
            EntityType = NormalizeFilter(query.EntityType),
            Action = NormalizeFilter(query.Action),
            Search = NormalizeFilter(query.Search)
        };

        var (items, totalCount) = await auditLogs.GetPageAsync(normalized, cancellationToken);
        var totalPages = totalCount == 0
            ? 0
            : (int)Math.Ceiling(totalCount / (double)normalized.PageSize);

        return new PagedResult<AuditLogDetails>(
            items.Select(ToDetails).ToArray(),
            normalized.Page,
            normalized.PageSize,
            totalCount,
            totalPages);
    }

    private static AuditLogDetails ToDetails(AuditLog entry)
    {
        return new AuditLogDetails(
            entry.Id,
            entry.UserId,
            entry.ActorUsername,
            entry.ActorRole,
            entry.Action,
            entry.EntityType,
            entry.EntityId,
            entry.Summary,
            ParseJsonOrNull(entry.OldValuesJson),
            ParseJsonOrNull(entry.NewValuesJson),
            entry.CreatedAtUtc);
    }

    private static string? SerializeOrNull(object? value)
    {
        return value is null ? null : JsonSerializer.Serialize(value, SerializerOptions);
    }

    private static JsonElement? ParseJsonOrNull(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? NormalizeFilter(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static string Truncate(string? value, int maxLength, string fallback)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return fallback;

        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }
}
