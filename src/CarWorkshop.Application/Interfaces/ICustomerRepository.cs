using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface ICustomerRepository
{
    Task<IReadOnlyList<Customer>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Customer?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    Task<bool> HasVehiclesAsync(int id, CancellationToken cancellationToken = default);

    Task<bool> HasAppointmentsAsync(int id, CancellationToken cancellationToken = default);

    Task AddAsync(Customer customer, CancellationToken cancellationToken = default);

    void Remove(Customer customer);
}
