using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Contracts;

public sealed record AppointmentCommand(
    int CustomerId,
    int VehicleId,
    DateTime ScheduledAtUtc,
    string ServiceType,
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
    string ServiceType,
    string? Notes,
    string Status,
    DateTime CreatedAt);
