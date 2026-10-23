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

    Task<IReadOnlyList<Appointment>> GetForDayAsync(DateTime dayStartUtc, DateTime nextDayUtc,
        CancellationToken cancellationToken = default);

    Task<T> WithDayLockAsync<T>(DateOnly day, Func<Task<T>> action,
        CancellationToken cancellationToken = default);

    Task<T> WithSchedulingLockAsync<T>(Func<Task<T>> action,
        CancellationToken cancellationToken = default);
}
