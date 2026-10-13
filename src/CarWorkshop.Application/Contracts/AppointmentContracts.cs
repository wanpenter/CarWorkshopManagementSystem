using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Contracts;

public sealed record AppointmentCommand(
    int CustomerId,
    int VehicleId,
    DateTime ScheduledAtUtc,
    IReadOnlyList<int> ServiceIds,
    string? Notes,
    AppointmentStatus Status);

public sealed record AppointmentDetails(
    int Id,
    int CustomerId,
    string CustomerName,
    int VehicleId,
    string RegistrationNumber,
    string VehicleName,
    DateTime ScheduledAtUtc,
    DateTime? EstimatedEndUtc,
    string ServiceType,
    IReadOnlyList<AppointmentServiceDetails> Services,
    string? Notes,
    string Status,
    DateTime CreatedAt);

public sealed record AppointmentServiceDetails(int ServiceId, string Name, decimal Price, int DurationMinutes);
