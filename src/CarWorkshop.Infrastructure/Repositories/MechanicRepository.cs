using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class MechanicRepository(CarWorkshopDbContext context)
    : IMechanicRepository
{
    public async Task<IReadOnlyList<Mechanic>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        return await context.Mechanics
            .AsNoTracking()
            .OrderBy(mechanic => mechanic.FullName)
            .ToListAsync(cancellationToken);
    }

    public Task<Mechanic?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return context.Mechanics.SingleOrDefaultAsync(
            mechanic => mechanic.Id == id,
            cancellationToken);
    }

    public Task AddAsync(
        Mechanic mechanic,
        CancellationToken cancellationToken = default)
    {
        return context.Mechanics
            .AddAsync(mechanic, cancellationToken)
            .AsTask();
    }
}