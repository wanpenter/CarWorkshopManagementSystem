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
            .SingleOrDefaultAsync(appointment => appointment.Id == id, cancellationToken);
    }

    public Task AddAsync(
        Appointment appointment,
        CancellationToken cancellationToken = default)
    {
        return _context.Appointments.AddAsync(appointment, cancellationToken).AsTask();
    }
}
