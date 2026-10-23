namespace CarWorkshop.Domain.Entities;

public sealed class Appointment
{
    private Appointment()
    {
    }

    private Appointment(
        int customerId,
        int vehicleId,
        DateTime scheduledAtUtc,
        string serviceType,
        string? notes,
        DateTime createdAtUtc,
        DateTime nowUtc)
    {
        ValidateIds(customerId, vehicleId);
        ScheduledAtUtc = EnsureFutureUtc(scheduledAtUtc, nowUtc, nameof(scheduledAtUtc));
        ServiceType = RequiredTrimmed(serviceType, 100, nameof(serviceType));
        Notes = OptionalTrimmed(notes, 500, nameof(notes));
        CustomerId = customerId;
        VehicleId = vehicleId;
        Status = AppointmentStatus.Scheduled;
        CreatedAt = EnsureUtc(createdAtUtc, nameof(createdAtUtc));
    }

    public int Id { get; private set; }

    public int CustomerId { get; private set; }

    public Customer Customer { get; private set; } = null!;

    public int VehicleId { get; private set; }

    public Vehicle Vehicle { get; private set; } = null!;

    public int? MechanicId { get; private set; }

    public Mechanic? Mechanic { get; private set; }

    public DateTime ScheduledAtUtc { get; private set; }

    public DateTime? EstimatedEndUtc { get; private set; }

    public ICollection<AppointmentService> Services { get; private set; } = new List<AppointmentService>();

    public string ServiceType { get; private set; } = string.Empty;

    public string? Notes { get; private set; }

    public AppointmentStatus Status { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public static Appointment Create(
        int customerId,
        int vehicleId,
        DateTime scheduledAtUtc,
        string serviceType,
        string? notes,
        DateTime createdAtUtc,
        DateTime nowUtc)
    {
        return new Appointment(
            customerId,
            vehicleId,
            scheduledAtUtc,
            serviceType,
            notes,
            createdAtUtc,
            nowUtc);
    }

    public static Appointment CreateBooking(
        int customerId,
        int vehicleId,
        DateTime scheduledAtUtc,
        IReadOnlyList<Service> services,
        string? notes,
        DateTime nowUtc)
    {
        if (services.Count == 0)
            throw new ArgumentException("Choose at least one service.", nameof(services));
        if (services.Any(service => !service.IsActive))
            throw new ArgumentException("Inactive services cannot be booked.", nameof(services));

        var appointment = new Appointment(
            customerId, vehicleId, scheduledAtUtc, services[0].Name, notes, nowUtc, nowUtc);
        appointment.Status = AppointmentStatus.Requested;
        appointment.SetServices(services);
        return appointment;
    }

    public void AssignMechanic(Mechanic mechanic)
    {
        ArgumentNullException.ThrowIfNull(mechanic);

        if (mechanic.Id <= 0)
        {
            throw new ArgumentException(
                "Mechanic must already exist.",
                nameof(mechanic));
        }

        if (!mechanic.IsActive)
        {
            throw new InvalidOperationException(
                "Inactive mechanics cannot receive assignments.");
        }

        if (Status is not (AppointmentStatus.Confirmed or AppointmentStatus.Scheduled))
        {
            throw new InvalidOperationException(
                "Only confirmed or scheduled appointments can receive assignments.");
        }

        MechanicId = mechanic.Id;
        Mechanic = mechanic;
    }
    public void UpdateBooking(
        int customerId,
        int vehicleId,
        DateTime scheduledAtUtc,
        IReadOnlyList<Service> services,
        string? notes,
        AppointmentStatus status,
        DateTime nowUtc)
    {
        if (Status is AppointmentStatus.Completed or AppointmentStatus.Cancelled or AppointmentStatus.Rejected)
            throw new InvalidOperationException($"A {Status} appointment can no longer be changed.");
        if (!CanTransition(Status, status))
            throw new InvalidOperationException($"Appointment status cannot change from {Status} to {status}.");
        if (services.Count == 0)
            throw new ArgumentException("Choose at least one service.", nameof(services));
        ValidateIds(customerId, vehicleId);
        var nextTime = EnsureUtc(scheduledAtUtc, nameof(scheduledAtUtc));
        var servicesUnchanged = Services.Count == services.Count &&
            Services.Select(item => item.ServiceId).Order().SequenceEqual(
                services.Select(service => service.Id).Order());
        if (!servicesUnchanged && services.Any(service => !service.IsActive))
            throw new ArgumentException("Inactive services cannot be added to a booking.", nameof(services));
        var rescheduled = nextTime != ScheduledAtUtc;
        if ((rescheduled || status is AppointmentStatus.Requested or AppointmentStatus.Confirmed or AppointmentStatus.Scheduled)
            && nextTime <= EnsureUtc(nowUtc, nameof(nowUtc)))
            throw new ArgumentOutOfRangeException(nameof(scheduledAtUtc), "Scheduled time must be in the future.");
        CustomerId = customerId;
        VehicleId = vehicleId;
        ScheduledAtUtc = nextTime;
        Notes = OptionalTrimmed(notes, 500, nameof(notes));
        Status = status;
        if (!servicesUnchanged)
        {
            ServiceType = services[0].Name;
            SetServices(services);
        }
        else if (rescheduled)
        {
            EstimatedEndUtc = nextTime.AddMinutes(Services.Sum(item => item.DurationMinutes));
        }
    }

    private void SetServices(IReadOnlyList<Service> services)
    {
        var duration = services.Sum(service => service.EstimatedDurationMinutes);
        if (duration < 1 || duration > 540)
            throw new ArgumentException("Total service duration must fit within one working day.", nameof(services));
        Services.Clear();
        foreach (var service in services)
            Services.Add(new AppointmentService(service));
        EstimatedEndUtc = ScheduledAtUtc.AddMinutes(duration);
    }

    public void Update(
        int customerId,
        int vehicleId,
        DateTime scheduledAtUtc,
        string serviceType,
        string? notes,
        AppointmentStatus status,
        DateTime nowUtc)
    {
        ValidateIds(customerId, vehicleId);
        var normalizedServiceType = RequiredTrimmed(serviceType, 100, nameof(serviceType));
        var normalizedNotes = OptionalTrimmed(notes, 500, nameof(notes));
        var normalizedScheduledAtUtc = EnsureUtc(scheduledAtUtc, nameof(scheduledAtUtc));
        var normalizedNowUtc = EnsureUtc(nowUtc, nameof(nowUtc));

        if (Status is AppointmentStatus.Completed or AppointmentStatus.Cancelled)
        {
            if (status != Status ||
                customerId != CustomerId ||
                vehicleId != VehicleId ||
                normalizedScheduledAtUtc != ScheduledAtUtc ||
                normalizedServiceType != ServiceType ||
                normalizedNotes != Notes)
            {
                throw new InvalidOperationException(
                    $"A {Status} appointment can no longer be changed.");
            }

            return;
        }

        if (!CanTransition(Status, status))
        {
            throw new InvalidOperationException(
                $"Appointment status cannot change from {Status} to {status}.");
        }

        if (status == AppointmentStatus.Scheduled && normalizedScheduledAtUtc <= normalizedNowUtc)
        {
            throw new ArgumentOutOfRangeException(
                nameof(scheduledAtUtc),
                "Scheduled time must be in the future.");
        }

        CustomerId = customerId;
        VehicleId = vehicleId;
        ScheduledAtUtc = normalizedScheduledAtUtc;
        ServiceType = normalizedServiceType;
        Notes = normalizedNotes;
        Status = status;
    }

    private static bool CanTransition(AppointmentStatus current, AppointmentStatus next)
    {
        return current switch
        {
            AppointmentStatus.Scheduled => next is AppointmentStatus.Scheduled
                or AppointmentStatus.InProgress
                or AppointmentStatus.Cancelled,
            AppointmentStatus.InProgress => next is AppointmentStatus.InProgress
                or AppointmentStatus.Completed
                or AppointmentStatus.Cancelled,
            AppointmentStatus.Completed => next == AppointmentStatus.Completed,
            AppointmentStatus.Cancelled => next == AppointmentStatus.Cancelled,
            AppointmentStatus.Requested => next is AppointmentStatus.Requested
                or AppointmentStatus.Confirmed or AppointmentStatus.Rejected or AppointmentStatus.Cancelled,
            AppointmentStatus.Confirmed => next is AppointmentStatus.Confirmed
                or AppointmentStatus.InProgress or AppointmentStatus.Cancelled,
            AppointmentStatus.Rejected => next == AppointmentStatus.Rejected,
            _ => false
        };
    }

    private static void ValidateIds(int customerId, int vehicleId)
    {
        if (customerId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(customerId), "Customer is required.");
        }

        if (vehicleId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(vehicleId), "Vehicle is required.");
        }
    }

    private static DateTime EnsureFutureUtc(
        DateTime value,
        DateTime nowUtc,
        string parameterName)
    {
        var utcValue = EnsureUtc(value, parameterName);
        var utcNow = EnsureUtc(nowUtc, nameof(nowUtc));
        if (utcValue <= utcNow)
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                "Scheduled time must be in the future.");
        }

        return utcValue;
    }

    private static DateTime EnsureUtc(DateTime value, string parameterName)
    {
        if (value.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Time must be UTC.", parameterName);
        }

        return value;
    }

    private static string RequiredTrimmed(string value, int maximumLength, string parameterName)
    {
        ArgumentNullException.ThrowIfNull(value, parameterName);

        var trimmed = value.Trim();
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("Value is required.", parameterName);
        }

        if (trimmed.Length > maximumLength)
        {
            throw new ArgumentException(
                $"Value cannot exceed {maximumLength} characters.",
                parameterName);
        }

        return trimmed;
    }

    private static string? OptionalTrimmed(string? value, int maximumLength, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maximumLength)
        {
            throw new ArgumentException(
                $"Value cannot exceed {maximumLength} characters.",
                parameterName);
        }

        return trimmed;
    }
}
