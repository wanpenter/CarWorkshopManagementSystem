using System.ComponentModel.DataAnnotations;
using CarWorkshop.Api.Validation;

namespace CarWorkshop.Api.Requests;

public sealed class MechanicRequest
{
    [Required]
    [StringLength(100)]
    public string FullName { get; init; } = string.Empty;

    [Required]
    [StringLength(20)]
    [PhoneNumber]
    public string Phone { get; init; } = string.Empty;

    public bool IsActive { get; init; } = true;
}