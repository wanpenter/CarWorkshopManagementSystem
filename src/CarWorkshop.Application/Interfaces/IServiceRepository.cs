using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface IServiceRepository
{
    Task<IReadOnlyList<Service>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Service?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Service>> GetByIdsAsync(IReadOnlyList<int> ids, CancellationToken cancellationToken = default);
    Task AddAsync(Service service, CancellationToken cancellationToken = default);
}
