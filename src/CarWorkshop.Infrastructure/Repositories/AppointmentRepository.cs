using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class AppointmentRepository : IAppointmentRepository
{
    private readonly CarWorkshopDbContext _context;

    public AppointmentRepository(CarWorkshopDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<Appointment>> GetAllAsync(
        int? customerId,
        AppointmentStatus? status,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Appointments
            .AsNoTracking()
            .Include(appointment => appointment.Customer)
            .Include(appointment => appointment.Vehicle)
            .Include(appointment => appointment.Services)
            .AsQueryable();

        if (customerId.HasValue)
        {
            query = query.Where(appointment => appointment.CustomerId == customerId.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(appointment => appointment.Status == status.Value);
        }

        return await query
            .OrderBy(appointment => appointment.ScheduledAtUtc)
            .ThenBy(appointment => appointment.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Appointment?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return _context.Appointments
            .Include(appointment => appointment.Customer)
            .Include(appointment => appointment.Vehicle)
            .Include(appointment => appointment.Services)
            .SingleOrDefaultAsync(appointment => appointment.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<Appointment>> GetForDayAsync(DateTime dayStartUtc,
        DateTime nextDayUtc, CancellationToken cancellationToken = default) =>
        await _context.Appointments.AsNoTracking()
            .Where(appointment => appointment.ScheduledAtUtc >= dayStartUtc &&
                appointment.ScheduledAtUtc < nextDayUtc)
            .ToListAsync(cancellationToken);

    public async Task<T> WithDayLockAsync<T>(DateOnly day, Func<Task<T>> action,
        CancellationToken cancellationToken = default)
    {
        // A named MySQL lock serializes the capacity check and write across API instances.
        var connection = _context.Database.GetDbConnection();
        var wasOpen = connection.State == System.Data.ConnectionState.Open;
        if (!wasOpen)
            await connection.OpenAsync(cancellationToken);
        var lockName = $"cw-booking-{day:yyyyMMdd}";
        try
        {
            await using (var acquire = connection.CreateCommand())
            {
                acquire.CommandText = "SELECT GET_LOCK(@name, 15)";
                var parameter = acquire.CreateParameter();
                parameter.ParameterName = "@name";
                parameter.Value = lockName;
                acquire.Parameters.Add(parameter);
                if (Convert.ToInt32(await acquire.ExecuteScalarAsync(cancellationToken)) != 1)
                    throw new CarWorkshop.Application.Exceptions.ConflictException(
                        "Booking is busy. Please try again.");
            }

            try { return await action(); }
            finally
            {
                await using var release = connection.CreateCommand();
                release.CommandText = "SELECT RELEASE_LOCK(@name)";
                var parameter = release.CreateParameter();
                parameter.ParameterName = "@name";
                parameter.Value = lockName;
                release.Parameters.Add(parameter);
                await release.ExecuteScalarAsync(CancellationToken.None);
            }
        }
        finally
        {
            if (!wasOpen)
                await connection.CloseAsync();
        }
    }

    public Task AddAsync(
        Appointment appointment,
        CancellationToken cancellationToken = default)
    {
        return _context.Appointments.AddAsync(appointment, cancellationToken).AsTask();
    }
}
