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

    public DateTime ScheduledAtUtc { get; private set; }

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
