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
    IPartRepository parts,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider,
    AuditLogService auditLogs)
{
    private const int DailyBookingCap = 10;
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    public async Task<DayAvailabilityDetails> GetAvailableSlotsAsync(
        DateOnly date,
        int durationMinutes,
        int? vehicleId = null,
        int? excludeAppointmentId = null,
        CancellationToken cancellationToken = default)
    {
        if (durationMinutes < 1 || durationMinutes > 540)
            throw new ArgumentOutOfRangeException(
                nameof(durationMinutes),
                "Service duration must be between 1 and 540 minutes.");

        if (vehicleId.HasValue)
        {
            if (vehicleId.Value <= 0)
                throw new ArgumentOutOfRangeException(nameof(vehicleId), "Vehicle is invalid.");
            await FindVehicleAsync(vehicleId.Value, cancellationToken);
        }

        return await ComputeDayAvailabilityAsync(
            date,
            durationMinutes,
            vehicleId,
            excludeAppointmentId,
            cancellationToken);
    }

    public async Task<DayAvailabilityDetails> GetAvailableSlotsForCustomerAsync(
        int customerId,
        DateOnly date,
        int durationMinutes,
        int? vehicleId = null,
        CancellationToken cancellationToken = default)
    {
        if (durationMinutes < 1 || durationMinutes > 540)
            throw new ArgumentOutOfRangeException(
                nameof(durationMinutes),
                "Service duration must be between 1 and 540 minutes.");

        if (vehicleId.HasValue)
        {
            if (vehicleId.Value <= 0)
                throw new ArgumentOutOfRangeException(nameof(vehicleId), "Vehicle is invalid.");
            var vehicle = await FindVehicleAsync(vehicleId.Value, cancellationToken);
            if (vehicle.CustomerId != customerId)
                throw new ForbiddenException("You can only check availability for your own vehicles.");
        }

        return await ComputeDayAvailabilityAsync(
            date,
            durationMinutes,
            vehicleId,
            excludeAppointmentId: null,
            cancellationToken);
    }

    private async Task<DayAvailabilityDetails> ComputeDayAvailabilityAsync(
        DateOnly date,
        int durationMinutes,
        int? vehicleId,
        int? excludeAppointmentId,
        CancellationToken cancellationToken)
    {
        var dayStartUtc = DateTime.SpecifyKind(
            date.ToDateTime(TimeOnly.MinValue).Subtract(MalaysiaOffset),
            DateTimeKind.Utc);
        var bookings = await appointments.GetForDayAsync(dayStartUtc, dayStartUtc.AddDays(1), cancellationToken);
        var active = bookings
            .Where(item => item.Id != excludeAppointmentId && ConsumesCapacity(item.Status))
            .ToArray();
        var activeMechanicCount = await mechanics.CountActiveAsync(cancellationToken);
        var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        var dayFull = active.Length >= DailyBookingCap;
        var closingTime = new TimeSpan(17, 30, 0);
        var slots = new List<TimeSlotAvailability>(18);

        for (var startMinutes = 510; startMinutes <= 1020; startMinutes += 30)
        {
            var localStart = date.ToDateTime(new TimeOnly(startMinutes / 60, startMinutes % 60));
            var startUtc = DateTime.SpecifyKind(localStart.Subtract(MalaysiaOffset), DateTimeKind.Utc);
            var endUtc = startUtc.AddMinutes(durationMinutes);
            var localEnd = endUtc.Add(MalaysiaOffset);
            var startLocal = $"{startMinutes / 60:D2}:{startMinutes % 60:D2}";

            string? reason = null;
            var remainingMechanics = 0;

            if (localEnd.Date != localStart.Date || localEnd.TimeOfDay > closingTime)
            {
                reason = "exceeds_hours";
            }
            else if (startUtc <= nowUtc)
            {
                reason = "past";
            }
            else if (activeMechanicCount == 0)
            {
                reason = "no_mechanics";
            }
            else if (dayFull)
            {
                reason = "day_full";
            }
            else if (vehicleId.HasValue && active.Any(item =>
                item.VehicleId == vehicleId.Value &&
                item.ScheduledAtUtc < endUtc &&
                (item.EstimatedEndUtc ?? item.ScheduledAtUtc.AddMinutes(30)) > startUtc))
            {
                reason = "vehicle_conflict";
            }
            else
            {
                var peak = PeakConcurrentBookings(startUtc, endUtc, active);
                if (peak > activeMechanicCount)
                {
                    reason = "slot_full";
                }
                else
                {
                    remainingMechanics = Math.Max(0, activeMechanicCount - (peak - 1));
                }
            }

            slots.Add(new TimeSlotAvailability(
                startLocal,
                startUtc,
                endUtc,
                reason is null,
                remainingMechanics,
                reason));
        }

        return new DayAvailabilityDetails(
            date.ToString("yyyy-MM-dd"),
            durationMinutes,
            active.Length,
            DailyBookingCap,
            activeMechanicCount,
            dayFull,
            slots);
    }

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
            await ValidateCapacityAsync(appointment, null, checkMechanicCapacity: true, cancellationToken);
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
        var oldStartUtc = appointment.ScheduledAtUtc;
        var oldEndUtc = appointment.EstimatedEndUtc;
        var oldValues = AppointmentSnapshot(appointment);
        return await appointments.WithDayLockAsync(day, async () =>
        {
            var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
            try
            {
                appointment.UpdateBooking(command.CustomerId, command.VehicleId,
                    command.ScheduledAtUtc, selected, command.Notes, command.Status,
                    nowUtc);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }
            ValidateWorkingHours(appointment);
            if (ConsumesCapacity(appointment.Status))
            {
                var scheduleOrCapacityChanged = !ConsumesCapacity(oldStatus) ||
                    appointment.ScheduledAtUtc != oldStartUtc ||
                    appointment.EstimatedEndUtc != oldEndUtc;
                await ValidateCapacityAsync(appointment, id, scheduleOrCapacityChanged, cancellationToken);
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
            if (appointment.Status == AppointmentStatus.Completed && appointment.Invoice is null)
            {
                var invoice = appointment.EnsureInvoiceIssued(FormatInvoiceNumber(appointment), nowUtc);
                await StageInvoiceIssuedAuditAsync(appointment, invoice, cancellationToken);
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
            var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
            try
            {
                appointment.TransitionStatus(nextStatus, reason, nowUtc);
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
            if (appointment.Status == AppointmentStatus.Completed && appointment.Invoice is null)
            {
                var invoice = appointment.EnsureInvoiceIssued(FormatInvoiceNumber(appointment), nowUtc);
                await StageInvoiceIssuedAuditAsync(appointment, invoice, cancellationToken);
            }
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);

    public Task<AppointmentDetails> AddPartUsageAsync(
        int appointmentId,
        int partId,
        int quantity,
        CancellationToken cancellationToken = default)
    {
        if (partId <= 0)
            throw new ArgumentOutOfRangeException(nameof(partId), "Choose a spare part.");

        return appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(appointmentId, cancellationToken);
            var part = await parts.GetByIdAsync(partId, cancellationToken)
                ?? throw new EntityNotFoundException("Part", partId);
            var previousStock = part.StockQuantity;

            AppointmentPart line;
            try
            {
                line = appointment.AddPartUsage(part, quantity);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            await auditLogs.StageAsync(
                "Appointment.PartAdded",
                "Appointment",
                appointment.Id,
                $"Added {line.Quantity} x {line.Name} ({line.Sku}) to appointment #{appointment.Id}.",
                oldValues: new { partId = part.Id, stockQuantity = previousStock },
                newValues: new
                {
                    partId = part.Id,
                    sku = line.Sku,
                    name = line.Name,
                    quantity = line.Quantity,
                    unitPrice = line.UnitPrice,
                    lineTotal = line.LineTotal,
                    stockQuantity = part.StockQuantity
                },
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);
    }

    public Task<AppointmentDetails> RemovePartUsageAsync(
        int appointmentId,
        int appointmentPartId,
        CancellationToken cancellationToken = default) =>
        appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(appointmentId, cancellationToken);
            var existingLine = appointment.PartsUsed.FirstOrDefault(item => item.Id == appointmentPartId)
                ?? throw new EntityNotFoundException("AppointmentPart", appointmentPartId);
            var part = await parts.GetByIdAsync(existingLine.PartId, cancellationToken);
            var previousStock = part?.StockQuantity;

            AppointmentPart removed;
            try
            {
                removed = appointment.RemovePartUsage(appointmentPartId, part);
            }
            catch (KeyNotFoundException)
            {
                throw new EntityNotFoundException("AppointmentPart", appointmentPartId);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            await auditLogs.StageAsync(
                "Appointment.PartRemoved",
                "Appointment",
                appointment.Id,
                $"Removed {removed.Quantity} x {removed.Name} ({removed.Sku}) from appointment #{appointment.Id}.",
                oldValues: new
                {
                    appointmentPartId,
                    partId = removed.PartId,
                    quantity = removed.Quantity,
                    stockQuantity = previousStock
                },
                newValues: new { stockQuantity = part?.StockQuantity },
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);

    public Task<AppointmentDetails> RecordPaymentAsync(
        int appointmentId,
        decimal amount,
        PaymentMethod method,
        string? reference,
        CancellationToken cancellationToken = default) =>
        appointments.WithSchedulingLockAsync(async () =>
        {
            var appointment = await FindAppointmentAsync(appointmentId, cancellationToken);
            if (appointment.Status != AppointmentStatus.Completed)
                throw new ConflictException("Payments can only be recorded for completed appointments.");

            var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
            var wasMissingInvoice = appointment.Invoice is null;
            Invoice invoice;
            try
            {
                invoice = appointment.EnsureInvoiceIssued(FormatInvoiceNumber(appointment), nowUtc);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            var previousPaid = invoice.AmountPaid;
            var previousStatus = invoice.PaymentStatus.ToString();
            try
            {
                invoice.RecordPayment(amount, method, reference, nowUtc);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            if (wasMissingInvoice)
            {
                await StageInvoiceIssuedAuditAsync(appointment, invoice, cancellationToken);
            }

            var roundedAmount = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
            await auditLogs.StageAsync(
                "Invoice.PaymentRecorded",
                "Appointment",
                appointment.Id,
                $"Recorded RM {roundedAmount:N2} ({method}) payment on invoice {invoice.InvoiceNumber}. Status: {invoice.PaymentStatus}.",
                oldValues: new
                {
                    invoiceNumber = invoice.InvoiceNumber,
                    amountPaid = previousPaid,
                    paymentStatus = previousStatus
                },
                newValues: new
                {
                    invoiceNumber = invoice.InvoiceNumber,
                    amountRecorded = roundedAmount,
                    amountPaid = invoice.AmountPaid,
                    balanceDue = invoice.BalanceDue,
                    paymentStatus = invoice.PaymentStatus.ToString(),
                    paymentMethod = invoice.PaymentMethod?.ToString(),
                    paymentReference = invoice.PaymentReference
                },
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(appointment);
        }, cancellationToken);

    public async Task LogReceiptPrintedAsync(int id, CancellationToken cancellationToken = default)
    {
        var appointment = await FindAppointmentAsync(id, cancellationToken);
        if (appointment.Status != AppointmentStatus.Completed)
            throw new ConflictException("Receipts can only be printed for completed appointments.");

        var receiptNumber = appointment.Invoice?.InvoiceNumber
            ?? $"TP-{appointment.ScheduledAtUtc.Add(MalaysiaOffset):yyyy}-{appointment.Id:D5}";
        var labourTotal = appointment.Services.Sum(service => service.Price);
        var partsTotal = appointment.PartsUsed.Sum(part => part.LineTotal);
        await auditLogs.RecordAsync(
            "Appointment.ReceiptPrinted",
            "Appointment",
            appointment.Id,
            $"Printed service receipt {receiptNumber} for appointment #{appointment.Id}.",
            newValues: new
            {
                receiptNumber,
                hasServiceRecord = appointment.ServiceRecord is not null,
                labourTotal,
                partsTotal,
                totalPrice = labourTotal + partsTotal
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
        bool checkMechanicCapacity,
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
        if (checkMechanicCapacity)
        {
            var activeMechanicCount = await mechanics.CountActiveAsync(cancellationToken);
            if (activeMechanicCount == 0)
                throw new ConflictException(
                    "No active mechanics are available to accept bookings right now.");
            if (PeakConcurrentBookings(proposed, active) > activeMechanicCount)
                throw new ConflictException(
                    $"All {activeMechanicCount} active {(activeMechanicCount == 1 ? "mechanic is" : "mechanics are")} already booked during this time slot. Choose another time.");
        }
    }

    private static int PeakConcurrentBookings(Appointment proposed, IReadOnlyList<Appointment> activeBookings)
    {
        var proposedStart = proposed.ScheduledAtUtc;
        var proposedEnd = proposed.EstimatedEndUtc ?? proposedStart.AddMinutes(30);
        return PeakConcurrentBookings(proposedStart, proposedEnd, activeBookings);
    }

    private static int PeakConcurrentBookings(
        DateTime proposedStart,
        DateTime proposedEnd,
        IReadOnlyList<Appointment> activeBookings)
    {
        var events = new List<(DateTime Time, int Delta)>
        {
            (proposedStart, 1),
            (proposedEnd, -1)
        };

        foreach (var booking in activeBookings)
        {
            var start = booking.ScheduledAtUtc;
            var end = booking.EstimatedEndUtc ?? start.AddMinutes(30);
            if (start < proposedEnd && end > proposedStart)
            {
                events.Add((start, 1));
                events.Add((end, -1));
            }
        }

        events.Sort((a, b) =>
        {
            var timeComparison = a.Time.CompareTo(b.Time);
            return timeComparison != 0 ? timeComparison : a.Delta.CompareTo(b.Delta);
        });

        var current = 0;
        var peak = 0;
        foreach (var (_, delta) in events)
        {
            current += delta;
            if (current > peak) peak = current;
        }

        return peak;
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

    private static string FormatInvoiceNumber(Appointment appointment) =>
        $"INV-{appointment.ScheduledAtUtc.Add(MalaysiaOffset):yyyy}-{appointment.Id:D5}";

    private Task StageInvoiceIssuedAuditAsync(
        Appointment appointment,
        Invoice invoice,
        CancellationToken cancellationToken) =>
        auditLogs.StageAsync(
            "Invoice.Issued",
            "Appointment",
            appointment.Id,
            $"Issued invoice {invoice.InvoiceNumber} (RM {invoice.TotalAmount:N2}) for appointment #{appointment.Id}.",
            newValues: new
            {
                invoiceNumber = invoice.InvoiceNumber,
                labourSubtotal = invoice.LabourSubtotal,
                partsSubtotal = invoice.PartsSubtotal,
                taxAmount = invoice.TaxAmount,
                totalAmount = invoice.TotalAmount,
                paymentStatus = invoice.PaymentStatus.ToString()
            },
            cancellationToken: cancellationToken);

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
            appointment.StatusReason,
            appointment.PartsUsed
                .OrderBy(item => item.Id)
                .Select(item => new AppointmentPartDetails(
                    item.Id,
                    item.PartId,
                    item.Sku,
                    item.Name,
                    item.UnitPrice,
                    item.Quantity,
                    item.LineTotal))
                .ToArray(),
            appointment.Invoice is { } invoice
                ? new InvoiceDetails(
                    invoice.Id,
                    invoice.InvoiceNumber,
                    invoice.LabourSubtotal,
                    invoice.PartsSubtotal,
                    invoice.TaxAmount,
                    invoice.TotalAmount,
                    invoice.AmountPaid,
                    invoice.BalanceDue,
                    invoice.PaymentStatus.ToString(),
                    invoice.PaymentMethod?.ToString(),
                    invoice.PaymentReference,
                    invoice.IssuedAtUtc,
                    invoice.PaidAtUtc)
                : null);
}
