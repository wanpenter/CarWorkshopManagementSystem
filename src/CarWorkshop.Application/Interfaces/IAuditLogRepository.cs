using CarWorkshop.Application.Contracts;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface IAuditLogRepository
{
    Task AddAsync(AuditLog entry, CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<AuditLog> Items, int TotalCount)> GetPageAsync(
        AuditLogQuery query,
        CancellationToken cancellationToken = default);
}
