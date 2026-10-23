using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class AppointmentService(
    IAppointmentRepository appointments,
    ICustomerRepository customers,
    IVehicleRepository vehicles,
    IServiceRepository services,
    IMechanicRepository mechanics,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider)
{
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    public async Task<IReadOnlyList<AppointmentDetails>> GetAllAsync(int? customerId,
        AppointmentStatus? status, CancellationToken cancellationToken = default)
    {
        if (customerId.HasValue)
            await FindCustomerAsync(customerId.Value, cancellationToken);
        return (await appointments.GetAllAsync(customerId, status, cancellationToken))
            .Select(ToDetails).ToArray();
    }

    public async Task<AppointmentDetails> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        ToDetails(await FindAppointmentAsync(id, cancellationToken));

    public async Task<AppointmentDetails> CreateAsync(AppointmentCommand command,
        CancellationToken cancellationToken = default)
    {
        if (command.Status != AppointmentStatus.Requested)
            throw new ArgumentException("A new appointment must have Requested status.", nameof(command.Status));
        var customer = await FindCustomerAsync(command.CustomerId, cancellationToken);
        var vehicle = await FindVehicleAsync(command.VehicleId, cancellationToken);
        ValidateOwnership(command.CustomerId, vehicle);
        var selected = await FindServicesAsync(command.ServiceIds, [], cancellationToken);
        var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        var appointment = Appointment.CreateBooking(command.CustomerId, command.VehicleId,
            command.ScheduledAtUtc, selected, command.Notes, nowUtc);
        var day = ValidateWorkingHours(appointment);
        return await appointments.WithDayLockAsync(day, async () =>
        {
            await ValidateCapacityAsync(appointment, null, cancellationToken);
            await appointments.AddAsync(appointment, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment, customer, vehicle);
        }, cancellationToken);
    }

    public async Task<AppointmentDetails> UpdateAsync(int id, AppointmentCommand command,
        CancellationToken cancellationToken = default)
    {
        // Read after taking the lock so assignment and rescheduling use the latest saved state.
        return await appointments.WithSchedulingLockAsync(
            () => UpdateBookingAsync(id, command, cancellationToken), cancellationToken);
    }

    private async Task<AppointmentDetails> UpdateBookingAsync(int id, AppointmentCommand command,
        CancellationToken cancellationToken)
    {
        var appointment = await FindAppointmentAsync(id, cancellationToken);
        var customer = await FindCustomerAsync(command.CustomerId, cancellationToken);
        var vehicle = await FindVehicleAsync(command.VehicleId, cancellationToken);
        ValidateOwnership(command.CustomerId, vehicle);
        var selected = await FindServicesAsync(command.ServiceIds,
            appointment.Services.Select(item => item.ServiceId).ToArray(), cancellationToken);
        var day = DateOnly.FromDateTime(command.ScheduledAtUtc.Add(MalaysiaOffset));
        return await appointments.WithDayLockAsync(day, async () =>
        {
            try
            {
                appointment.UpdateBooking(command.CustomerId, command.VehicleId,
                    command.ScheduledAtUtc, selected, command.Notes, command.Status,
                    timeProvider.GetUtcNow().UtcDateTime);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }
            ValidateWorkingHours(appointment);
            if (ConsumesCapacity(appointment.Status))
            {
                await ValidateCapacityAsync(appointment, id, cancellationToken);
                await ValidateMechanicScheduleAsync(appointment, cancellationToken);
            }
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment, customer, vehicle);
        }, cancellationToken);
    }

    public async Task<AppointmentDetails> AssignMechanicAsync(int appointmentId, int mechanicId,
        CancellationToken cancellationToken = default)
    {
        if (mechanicId <= 0)
            throw new ArgumentOutOfRangeException(nameof(mechanicId), "Choose a mechanic.");

        return await appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(appointmentId, cancellationToken);
            var mechanic = await mechanics.GetByIdAsync(mechanicId, cancellationToken)
                ?? throw new EntityNotFoundException("Mechanic", mechanicId);

            if (!appointment.EstimatedEndUtc.HasValue)
                throw new ConflictException("This appointment needs an estimated end time before assignment.");

            try { appointment.AssignMechanic(mechanic); }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            await ValidateMechanicScheduleAsync(appointment, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);
    }

    private async Task ValidateMechanicScheduleAsync(Appointment proposed,
        CancellationToken cancellationToken)
    {
        if (!proposed.MechanicId.HasValue)
            return;

        var dayStartUtc = proposed.ScheduledAtUtc.Add(MalaysiaOffset).Date.Subtract(MalaysiaOffset);
        var bookings = await appointments.GetForDayAsync(dayStartUtc, dayStartUtc.AddDays(1), cancellationToken);
        if (bookings.Any(other => other.Id != proposed.Id &&
            other.MechanicId == proposed.MechanicId && ConsumesCapacity(other.Status) &&
            other.ScheduledAtUtc < proposed.EstimatedEndUtc &&
            (other.EstimatedEndUtc ?? other.ScheduledAtUtc.AddMinutes(30)) > proposed.ScheduledAtUtc))
            throw new ConflictException("This mechanic already has an overlapping appointment.");
    }

    private async Task ValidateCapacityAsync(Appointment proposed, int? ownId,
        CancellationToken cancellationToken)
    {
        var dayStartUtc = proposed.ScheduledAtUtc.Add(MalaysiaOffset).Date.Subtract(MalaysiaOffset);
        var bookings = await appointments.GetForDayAsync(dayStartUtc, dayStartUtc.AddDays(1), cancellationToken);
        var active = bookings.Where(item => item.Id != ownId && ConsumesCapacity(item.Status)).ToArray();
        if (active.Length >= 10)
            throw new ConflictException("This day already has 10 active bookings.");
        if (active.Any(item => item.VehicleId == proposed.VehicleId &&
            item.ScheduledAtUtc < proposed.EstimatedEndUtc &&
            (item.EstimatedEndUtc ?? item.ScheduledAtUtc.AddMinutes(30)) > proposed.ScheduledAtUtc))
            throw new ConflictException("This vehicle already has an overlapping booking.");
    }

    private static bool ConsumesCapacity(AppointmentStatus status) =>
        status is not (AppointmentStatus.Cancelled or AppointmentStatus.Rejected);

    private static DateOnly ValidateWorkingHours(Appointment appointment)
    {
        var localStart = appointment.ScheduledAtUtc.Add(MalaysiaOffset);
        var localEnd = appointment.EstimatedEndUtc!.Value.Add(MalaysiaOffset);
        var startMinutes = localStart.Hour * 60 + localStart.Minute;
        if (startMinutes < 510 || startMinutes >= 1050 || (startMinutes - 510) % 30 != 0 ||
            localStart.Second != 0 || localStart.Millisecond != 0 ||
            localEnd.Date != localStart.Date || localEnd.TimeOfDay > new TimeSpan(17, 30, 0))
            throw new ArgumentException(
                "Choose a 30-minute start between 08:30 and 17:00 Malaysia time; services must finish by 17:30.",
                "scheduledAtUtc");
        return DateOnly.FromDateTime(localStart);
    }

    private async Task<IReadOnlyList<Service>> FindServicesAsync(IReadOnlyList<int> ids,
        IReadOnlyList<int> existingIds,
        CancellationToken cancellationToken)
    {
        if (ids is null || ids.Count == 0 || ids.Any(id => id <= 0) || ids.Distinct().Count() != ids.Count)
            throw new ArgumentException("Choose one or more distinct services.", "serviceIds");
        var selected = await services.GetByIdsAsync(ids, cancellationToken);
        if (selected.Count != ids.Count)
            throw new ArgumentException("One or more services do not exist.", "serviceIds");
        if (selected.Any(service => !service.IsActive && !existingIds.Contains(service.Id)))
            throw new ArgumentException("Inactive services cannot be added to a booking.", "serviceIds");
        return ids.Select(id => selected.Single(service => service.Id == id)).ToArray();
    }

    private async Task<Appointment> FindAppointmentAsync(int id, CancellationToken cancellationToken) =>
        await appointments.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Appointment", id);
    private async Task<Customer> FindCustomerAsync(int id, CancellationToken cancellationToken) =>
        await customers.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Customer", id);
    private async Task<Vehicle> FindVehicleAsync(int id, CancellationToken cancellationToken) =>
        await vehicles.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Vehicle", id);

    private static void ValidateOwnership(int customerId, Vehicle vehicle)
    {
        if (vehicle.CustomerId != customerId)
            throw new ArgumentException("Vehicle does not belong to the selected customer.", "vehicleId");
    }

    private static AppointmentDetails ToDetails(Appointment appointment) =>
        ToDetails(appointment, appointment.Customer, appointment.Vehicle);

    private static AppointmentDetails ToDetails(Appointment appointment, Customer customer, Vehicle vehicle) =>
        new(appointment.Id, appointment.CustomerId, customer.FullName, appointment.VehicleId,
            vehicle.RegistrationNumber, $"{vehicle.Make} {vehicle.Model}", appointment.ScheduledAtUtc,
            appointment.EstimatedEndUtc, appointment.ServiceType,
            appointment.Services.Select(item => new AppointmentServiceDetails(item.ServiceId,
                item.Name, item.Price, item.DurationMinutes)).ToArray(),
            appointment.Notes, appointment.Status.ToString(), appointment.CreatedAt,
            appointment.MechanicId, appointment.Mechanic?.FullName);
}
