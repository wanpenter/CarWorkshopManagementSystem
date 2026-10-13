using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class ServiceRepository(CarWorkshopDbContext context) : IServiceRepository
{
    public async Task<IReadOnlyList<Service>> GetAllAsync(CancellationToken cancellationToken = default) =>
        await context.Services.AsNoTracking().OrderBy(service => service.Name).ToListAsync(cancellationToken);

    public Task<Service?> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        context.Services.SingleOrDefaultAsync(service => service.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Service>> GetByIdsAsync(IReadOnlyList<int> ids, CancellationToken cancellationToken = default) =>
        await context.Services.Where(service => ids.Contains(service.Id)).ToListAsync(cancellationToken);

    public Task AddAsync(Service service, CancellationToken cancellationToken = default) =>
        context.Services.AddAsync(service, cancellationToken).AsTask();
}
