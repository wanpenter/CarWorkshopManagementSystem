using System.ComponentModel.DataAnnotations;
using CarWorkshop.Api.Validation;

namespace CarWorkshop.Api.Requests;

public sealed class VehicleRequest : IValidatableObject
{
    [Range(1, int.MaxValue, ErrorMessage = "Customer is required.")]
    public int CustomerId { get; init; }

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
