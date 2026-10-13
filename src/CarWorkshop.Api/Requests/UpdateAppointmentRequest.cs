using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Requests;

public sealed class UpdateAppointmentRequest : IValidatableObject
{
    [Range(1, int.MaxValue, ErrorMessage = "Customer is required.")]
    public int CustomerId { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "Vehicle is required.")]
    public int VehicleId { get; init; }

    public DateTime ScheduledAtUtc { get; init; }

    [Required(ErrorMessage = "Service type is required.")]
    [StringLength(100, ErrorMessage = "Service type cannot exceed 100 characters.")]
    public string ServiceType { get; init; } = string.Empty;

    [StringLength(500, ErrorMessage = "Notes cannot exceed 500 characters.")]
    public string? Notes { get; init; }

    [Required(ErrorMessage = "Status is required.")]
    [RegularExpression(
        "^(Scheduled|InProgress|Completed|Cancelled)$",
        ErrorMessage = "Status must be Scheduled, InProgress, Completed, or Cancelled.")]
    public string Status { get; init; } = string.Empty;

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
