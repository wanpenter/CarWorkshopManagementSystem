using System.ComponentModel.DataAnnotations;
using CarWorkshop.Api.Validation;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Api.Requests;

public sealed class PortalVehicleRequest : IValidatableObject
{
    [Required(ErrorMessage = "Registration number is required.")]
    [RegistrationNumber]
    public string RegistrationNumber { get; init; } = string.Empty;

    [Required(ErrorMessage = "Make is required.")]
    [StringLength(50, ErrorMessage = "Make cannot exceed 50 characters.")]
    public string Make { get; init; } = string.Empty;

    [Required(ErrorMessage = "Model is required.")]
    [StringLength(100, ErrorMessage = "Model cannot exceed 100 characters.")]
    public string Model { get; init; } = string.Empty;

    public int? Year { get; init; }

    [Range(0, int.MaxValue, ErrorMessage = "Mileage cannot be negative.")]
    public int Mileage { get; init; }

    public bool IsActive { get; init; } = true;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Year is < 1900 || Year > DateTime.UtcNow.Year + 1)
        {
            yield return new ValidationResult(
                $"Year must be between 1900 and {DateTime.UtcNow.Year + 1}.",
                [nameof(Year)]);
        }
    }
}

public sealed class PortalCreateAppointmentRequest : IValidatableObject
{
    [Range(1, int.MaxValue, ErrorMessage = "Vehicle is required.")]
    public int VehicleId { get; init; }

    public DateTime ScheduledAtUtc { get; init; }

    [Required, MinLength(1, ErrorMessage = "Choose at least one service.")]
    public int[] ServiceIds { get; init; } = [];

    [StringLength(500, ErrorMessage = "Notes cannot exceed 500 characters.")]
    public string? Notes { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (ScheduledAtUtc == default || ScheduledAtUtc.Kind != DateTimeKind.Utc)
        {
            yield return new ValidationResult(
                "Scheduled time must be a UTC ISO timestamp ending in Z.",
                [nameof(ScheduledAtUtc)]);
        }
    }
}

public sealed class PortalCancelAppointmentRequest
{
    [StringLength(Appointment.MaxStatusReasonLength, ErrorMessage = "Reason cannot exceed 300 characters.")]
    public string? Reason { get; init; }
}
