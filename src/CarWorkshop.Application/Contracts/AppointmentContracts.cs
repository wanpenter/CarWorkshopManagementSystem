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
    DateTime CreatedAt,
    int? MechanicId = null,
    string? MechanicName = null,
    ServiceRecordDetails? ServiceRecord = null,
    string? StatusReason = null,
    IReadOnlyList<AppointmentPartDetails>? PartsUsed = null,
    InvoiceDetails? Invoice = null);

public sealed record ServiceRecordDetails(
    int Mileage,
    string WorkPerformed,
    DateTime RecordedAtUtc,
    int? NextServiceMileage = null);

public sealed record AppointmentServiceDetails(int ServiceId, string Name, decimal Price, int DurationMinutes);

public sealed record AppointmentPartDetails(
    int Id,
    int PartId,
    string Sku,
    string Name,
    decimal UnitPrice,
    int Quantity,
    decimal LineTotal);

public sealed record InvoiceDetails(
    int Id,
    string InvoiceNumber,
    decimal LabourSubtotal,
    decimal PartsSubtotal,
    decimal TaxAmount,
    decimal TotalAmount,
    decimal AmountPaid,
    decimal BalanceDue,
    string PaymentStatus,
    string? PaymentMethod,
    string? PaymentReference,
    DateTime IssuedAtUtc,
    DateTime? PaidAtUtc);

public sealed record TimeSlotAvailability(
    string StartLocal,
    DateTime StartUtc,
    DateTime EndUtc,
    bool Available,
    int RemainingMechanics,
    string? UnavailableReason);

public sealed record DayAvailabilityDetails(
    string Date,
    int DurationMinutes,
    int DailyBookedCount,
    int DailyCap,
    int ActiveMechanicCount,
    bool DayFull,
    IReadOnlyList<TimeSlotAvailability> Slots);
