using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface IPartRepository
{
    Task<IReadOnlyList<Part>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Part?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task AddAsync(Part part, CancellationToken cancellationToken = default);
}
