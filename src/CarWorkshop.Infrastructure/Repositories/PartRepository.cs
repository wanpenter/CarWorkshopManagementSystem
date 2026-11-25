using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class PartRepository(CarWorkshopDbContext context) : IPartRepository
{
    public async Task<IReadOnlyList<Part>> GetAllAsync(CancellationToken cancellationToken = default) =>
        await context.Parts
            .AsNoTracking()
            .OrderBy(part => part.Name)
            .ThenBy(part => part.Sku)
            .ToListAsync(cancellationToken);

    public Task<Part?> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        context.Parts.SingleOrDefaultAsync(part => part.Id == id, cancellationToken);

    public Task AddAsync(Part part, CancellationToken cancellationToken = default) =>
        context.Parts.AddAsync(part, cancellationToken).AsTask();
}
