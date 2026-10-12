using System.ComponentModel.DataAnnotations;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Api.Validation;

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class RegistrationNumberAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not string registrationNumber || string.IsNullOrWhiteSpace(registrationNumber))
        {
            return ValidationResult.Success;
        }

        try
        {
            Vehicle.NormalizeRegistrationNumber(registrationNumber);
            return ValidationResult.Success;
        }
        catch (ArgumentException exception)
        {
            return new ValidationResult(exception.Message.Split(" (Parameter", StringSplitOptions.None)[0]);
        }
    }
}
