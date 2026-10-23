using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface IMechanicRepository
{
    Task<IReadOnlyList<Mechanic>> GetAllAsync(
        CancellationToken cancellationToken = default);

    Task<Mechanic?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Mechanic mechanic,
        CancellationToken cancellationToken = default);
}