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
    TimeProvider timeProvider,
    AuditLogService auditLogs)
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

    public async Task<AppointmentDetails> GetByIdForCustomerAsync(
        int id,
        int customerId,
        CancellationToken cancellationToken = default)
    {
        var appointment = await FindAppointmentAsync(id, cancellationToken);
        if (appointment.CustomerId != customerId)
            throw new ForbiddenException("You can only view your own appointments.");
        return ToDetails(appointment);
    }

    public async Task<AppointmentDetails> CreateForCustomerAsync(
        int customerId,
        int vehicleId,
        DateTime scheduledAtUtc,
        IReadOnlyList<int> serviceIds,
        string? notes,
        CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(vehicleId, cancellationToken);
        if (vehicle.CustomerId != customerId)
            throw new ForbiddenException("You can only book appointments for your own vehicles.");

        return await CreateAsync(
            new AppointmentCommand(
                customerId,
                vehicleId,
                scheduledAtUtc,
                serviceIds,
                notes,
                AppointmentStatus.Requested),
            cancellationToken);
    }

    public Task<AppointmentDetails> CancelForCustomerAsync(
        int id,
        int customerId,
        string? reason,
        CancellationToken cancellationToken = default) =>
        appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(id, cancellationToken);
            if (appointment.CustomerId != customerId)
                throw new ForbiddenException("You can only cancel your own appointments.");
            if (appointment.Status is not (AppointmentStatus.Requested or AppointmentStatus.Confirmed or AppointmentStatus.Scheduled))
                throw new ConflictException(
                    "Only pending or confirmed appointments can be cancelled online. Contact the workshop for jobs already in progress.");

            var oldStatus = appointment.Status;
            var oldValues = AppointmentSnapshot(appointment);
            try
            {
                appointment.TransitionStatus(AppointmentStatus.Cancelled, reason, timeProvider.GetUtcNow().UtcDateTime);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            var reasonSuffix = string.IsNullOrWhiteSpace(appointment.StatusReason)
                ? string.Empty
                : $" Reason: {appointment.StatusReason}";
            await auditLogs.StageAsync(
                "Appointment.StatusChanged",
                "Appointment",
                appointment.Id,
                $"Customer cancelled appointment #{appointment.Id} (was {oldStatus}).{reasonSuffix}",
                oldValues: oldValues,
                newValues: AppointmentSnapshot(appointment),
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);

    public async Task LogReceiptPrintedForCustomerAsync(
        int id,
        int customerId,
        CancellationToken cancellationToken = default)
    {
        var appointment = await FindAppointmentAsync(id, cancellationToken);
        if (appointment.CustomerId != customerId)
            throw new ForbiddenException("You can only print receipts for your own appointments.");

        await LogReceiptPrintedAsync(id, cancellationToken);
    }

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
            await auditLogs.RecordAsync(
                "Appointment.Created",
                "Appointment",
                appointment.Id,
                $"Booked appointment #{appointment.Id} for {customer.FullName} ({vehicle.RegistrationNumber}).",
                newValues: AppointmentSnapshot(appointment),
                cancellationToken: cancellationToken);
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
        var oldStatus = appointment.Status;
        var oldValues = AppointmentSnapshot(appointment);
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
            var statusChanged = oldStatus != appointment.Status;
            await auditLogs.StageAsync(
                statusChanged ? "Appointment.StatusChanged" : "Appointment.Updated",
                "Appointment",
                appointment.Id,
                statusChanged
                    ? $"Changed appointment #{appointment.Id} status from {oldStatus} to {appointment.Status}."
                    : $"Updated appointment #{appointment.Id} for {customer.FullName} ({vehicle.RegistrationNumber}).",
                oldValues: oldValues,
                newValues: AppointmentSnapshot(appointment),
                cancellationToken: cancellationToken);
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

            var oldMechanic = new { mechanicId = appointment.MechanicId, mechanicName = appointment.Mechanic?.FullName };
            try { appointment.AssignMechanic(mechanic); }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            await ValidateMechanicScheduleAsync(appointment, cancellationToken);
            await auditLogs.StageAsync(
                "Appointment.MechanicAssigned",
                "Appointment",
                appointment.Id,
                $"Assigned mechanic {mechanic.FullName} to appointment #{appointment.Id}.",
                oldValues: oldMechanic,
                newValues: new { mechanicId = mechanic.Id, mechanicName = mechanic.FullName },
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);
    }

    public Task<AppointmentDetails> TransitionStatusAsync(
        int id,
        AppointmentStatus nextStatus,
        string? reason,
        CancellationToken cancellationToken = default) =>
        appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(id, cancellationToken);
            var oldStatus = appointment.Status;
            var oldValues = AppointmentSnapshot(appointment);
            try
            {
                appointment.TransitionStatus(nextStatus, reason, timeProvider.GetUtcNow().UtcDateTime);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            var reasonSuffix = string.IsNullOrWhiteSpace(appointment.StatusReason)
                ? string.Empty
                : $" Reason: {appointment.StatusReason}";
            await auditLogs.StageAsync(
                "Appointment.StatusChanged",
                "Appointment",
                appointment.Id,
                $"Changed appointment #{appointment.Id} status from {oldStatus} to {appointment.Status}.{reasonSuffix}",
                oldValues: oldValues,
                newValues: AppointmentSnapshot(appointment),
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);

    public async Task LogReceiptPrintedAsync(int id, CancellationToken cancellationToken = default)
    {
        var appointment = await FindAppointmentAsync(id, cancellationToken);
        if (appointment.Status != AppointmentStatus.Completed)
            throw new ConflictException("Receipts can only be printed for completed appointments.");

        var receiptNumber = $"TP-{appointment.ScheduledAtUtc.Add(MalaysiaOffset):yyyy}-{appointment.Id:D5}";
        await auditLogs.RecordAsync(
            "Appointment.ReceiptPrinted",
            "Appointment",
            appointment.Id,
            $"Printed service receipt {receiptNumber} for appointment #{appointment.Id}.",
            newValues: new
            {
                receiptNumber,
                hasServiceRecord = appointment.ServiceRecord is not null,
                totalPrice = appointment.Services.Sum(service => service.Price)
            },
            cancellationToken: cancellationToken);
    }

    public Task<AppointmentDetails> RecordServiceAsync(int appointmentId, int mileage,
        IReadOnlyList<int> serviceIds, string? notes, string? workPerformed,
        int? nextServiceMileage = null,
        CancellationToken cancellationToken = default) =>
        appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(appointmentId, cancellationToken);
            var summary = await BuildServiceSummaryAsync(appointment, serviceIds, notes, workPerformed, cancellationToken);
            var previousVehicleMileage = appointment.Vehicle.Mileage;
            try
            {
                appointment.RecordService(mileage, summary, timeProvider.GetUtcNow().UtcDateTime, nextServiceMileage);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            var vehicleMileageUpdated = appointment.Vehicle.RecordOdometerReading(mileage);
            var nextServiceSuffix = nextServiceMileage.HasValue
                ? $" (next service due at {nextServiceMileage.Value:N0} km)"
                : string.Empty;
            await auditLogs.StageAsync(
                "Appointment.ServiceRecorded",
                "Appointment",
                appointment.Id,
                $"Recorded service for appointment #{appointment.Id} at {mileage:N0} km{nextServiceSuffix}.",
                oldValues: vehicleMileageUpdated ? new { vehicleMileage = previousVehicleMileage } : null,
                newValues: new
                {
                    mileage,
                    nextServiceMileage,
                    vehicleMileage = appointment.Vehicle.Mileage,
                    vehicleMileageUpdated,
                    workPerformed = summary
                },
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);

    private async Task<string> BuildServiceSummaryAsync(Appointment appointment, IReadOnlyList<int> serviceIds,
        string? notes, string? workPerformed, CancellationToken cancellationToken)
    {
        if (serviceIds.Count == 0)
        {
            var description = notes?.Trim();
            if (!string.IsNullOrEmpty(description)) return description;
            if (!string.IsNullOrWhiteSpace(workPerformed)) return workPerformed;
            throw new ArgumentException("Choose a service or describe other work in Notes.", nameof(serviceIds));
        }

        if (serviceIds.Any(id => id <= 0) || serviceIds.Distinct().Count() != serviceIds.Count)
            throw new ArgumentException("Choose each service only once.", nameof(serviceIds));

        var names = appointment.Services.ToDictionary(item => item.ServiceId, item => item.Name);
        var extraIds = serviceIds.Where(id => !names.ContainsKey(id)).ToArray();
        if (extraIds.Length > 0)
        {
            var extras = await services.GetByIdsAsync(extraIds, cancellationToken);
            if (extras.Count != extraIds.Length || extras.Any(service => !service.IsActive))
                throw new ArgumentException("Choose additional work from active catalogue services.", nameof(serviceIds));
            foreach (var service in extras) names.Add(service.Id, service.Name);
        }

        var summary = string.Join("\n", serviceIds.Select(id => names[id]));
        if (!string.IsNullOrWhiteSpace(notes)) summary += $"\n\nNotes: {notes.Trim()}";
        if (summary.Length > ServiceRecord.MaxWorkLength)
            throw new ArgumentException("The selected services and notes are too long. Shorten the notes or reduce the selection.", nameof(serviceIds));
        return summary;
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

    private static object AppointmentSnapshot(Appointment appointment) => new
    {
        appointment.CustomerId,
        appointment.VehicleId,
        appointment.ScheduledAtUtc,
        appointment.EstimatedEndUtc,
        status = appointment.Status.ToString(),
        appointment.StatusReason,
        appointment.MechanicId,
        services = appointment.Services.Select(item => item.Name).ToArray(),
        appointment.Notes
    };

    private static AppointmentDetails ToDetails(Appointment appointment) =>
        ToDetails(appointment, appointment.Customer, appointment.Vehicle);

    private static AppointmentDetails ToDetails(Appointment appointment, Customer customer, Vehicle vehicle) =>
        new(appointment.Id, appointment.CustomerId, customer.FullName, appointment.VehicleId,
            vehicle.RegistrationNumber, $"{vehicle.Make} {vehicle.Model}", appointment.ScheduledAtUtc,
            appointment.EstimatedEndUtc, appointment.ServiceType,
            appointment.Services.Select(item => new AppointmentServiceDetails(item.ServiceId,
                item.Name, item.Price, item.DurationMinutes)).ToArray(),
            appointment.Notes, appointment.Status.ToString(), appointment.CreatedAt,
            appointment.MechanicId, appointment.Mechanic?.FullName,
            appointment.ServiceRecord is { } record
                ? new ServiceRecordDetails(record.Mileage, record.WorkPerformed, record.RecordedAtUtc, record.NextServiceMileage)
                : null,
            appointment.StatusReason);
}
