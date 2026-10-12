using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Validation;

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class PhoneNumberAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not string phone || string.IsNullOrWhiteSpace(phone))
        {
            return ValidationResult.Success;
        }

        var trimmed = phone.Trim();
        if (trimmed.Any(character =>
                !(character >= '0' && character <= '9') &&
                character is not '+' and not ' ' and not '(' and not ')' and not '-'))
        {
            return new ValidationResult(
                "Phone can only contain digits, spaces, +, parentheses, and hyphens.");
        }

        var digitCount = trimmed.Count(character => character is >= '0' and <= '9');
        return digitCount is >= 7 and <= 15 && trimmed.Count(character => character == '+') <= 1 &&
               (!trimmed.Contains('+') || trimmed[0] == '+')
            ? ValidationResult.Success
            : new ValidationResult("Phone must contain between 7 and 15 digits.");
    }
}
