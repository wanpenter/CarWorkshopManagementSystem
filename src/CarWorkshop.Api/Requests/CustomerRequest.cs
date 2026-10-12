using System.ComponentModel.DataAnnotations;
using CarWorkshop.Api.Validation;

namespace CarWorkshop.Api.Requests;

public sealed class CustomerRequest
{
    [Required(ErrorMessage = "Full name is required.")]
    [StringLength(100, ErrorMessage = "Full name cannot exceed 100 characters.")]
    public string FullName { get; init; } = string.Empty;

    [Required(ErrorMessage = "Phone is required.")]
    [StringLength(20, ErrorMessage = "Phone cannot exceed 20 characters.")]
    [PhoneNumber]
    public string Phone { get; init; } = string.Empty;

    [StringLength(500, ErrorMessage = "Address cannot exceed 500 characters.")]
    public string? Address { get; init; }
}
