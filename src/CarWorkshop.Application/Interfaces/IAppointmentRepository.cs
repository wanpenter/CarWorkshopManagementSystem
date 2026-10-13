using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Interfaces;

public interface IAppointmentRepository
{
    Task<IReadOnlyList<Appointment>> GetAllAsync(
        int? customerId,
        AppointmentStatus? status,
        CancellationToken cancellationToken = default);

    Task<Appointment?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task AddAsync(Appointment appointment, CancellationToken cancellationToken = default);
}
