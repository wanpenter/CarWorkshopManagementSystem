using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class AuditLogRepository(CarWorkshopDbContext context) : IAuditLogRepository
{
    public async Task AddAsync(AuditLog entry, CancellationToken cancellationToken = default)
    {
        await context.AuditLogs.AddAsync(entry, cancellationToken);
    }

    public async Task<(IReadOnlyList<AuditLog> Items, int TotalCount)> GetPageAsync(
        AuditLogQuery query,
        CancellationToken cancellationToken = default)
    {
        var entries = context.AuditLogs.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.EntityType))
        {
            var entityType = query.EntityType.Trim();
            entries = entries.Where(entry => entry.EntityType == entityType);
        }

        if (!string.IsNullOrWhiteSpace(query.Action))
        {
            var action = query.Action.Trim();
            entries = entries.Where(entry => entry.Action == action);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            var hasEntityId = int.TryParse(search, out var entityId);
            entries = entries.Where(entry =>
                entry.ActorUsername.Contains(search) ||
                entry.Summary.Contains(search) ||
                entry.Action.Contains(search) ||
                entry.EntityType.Contains(search) ||
                (hasEntityId && entry.EntityId == entityId));
        }

        var totalCount = await entries.CountAsync(cancellationToken);
        var items = await entries
            .OrderByDescending(entry => entry.CreatedAtUtc)
            .ThenByDescending(entry => entry.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }
}
