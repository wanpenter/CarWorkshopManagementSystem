using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Requests;

public sealed class CreateAppointmentRequest : IValidatableObject
{
    [Range(1, int.MaxValue, ErrorMessage = "Customer is required.")]
    public int CustomerId { get; init; }

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
