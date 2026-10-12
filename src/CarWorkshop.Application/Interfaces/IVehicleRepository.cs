using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface IVehicleRepository
{
    Task<IReadOnlyList<Vehicle>> GetAllAsync(
        int? customerId,
        CancellationToken cancellationToken = default);

    Task<Vehicle?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    Task<bool> RegistrationExistsAsync(
        string normalizedRegistrationNumber,
        int? excludingVehicleId = null,
        CancellationToken cancellationToken = default);

    Task AddAsync(Vehicle vehicle, CancellationToken cancellationToken = default);

    void Remove(Vehicle vehicle);
}
