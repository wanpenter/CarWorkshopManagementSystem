using System.ComponentModel.DataAnnotations;
using CarWorkshop.Api.Validation;

namespace CarWorkshop.Api.Models;

public sealed record LoginRequest(
    [param: Required, StringLength(50)] string Username,
    [param: Required, StringLength(128)] string Password);

public sealed record RegisterCustomerRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters.")]
    public string Username { get; init; } = string.Empty;

    [Required(ErrorMessage = "Full name is required.")]
    [StringLength(100, ErrorMessage = "Full name cannot exceed 100 characters.")]
    public string FullName { get; init; } = string.Empty;

    [Required(ErrorMessage = "Phone is required.")]
    [StringLength(20, ErrorMessage = "Phone cannot exceed 20 characters.")]
    [PhoneNumber]
    public string Phone { get; init; } = string.Empty;

    [StringLength(500, ErrorMessage = "Address cannot exceed 500 characters.")]
    public string? Address { get; init; }

    [Required(ErrorMessage = "Password is required.")]
    [StringLength(128, MinimumLength = 12, ErrorMessage = "Password must be between 12 and 128 characters.")]
    public string Password { get; init; } = string.Empty;
}

public sealed record ChangePasswordRequest(
    [param: Required, StringLength(128)] string CurrentPassword,
    [param: Required, StringLength(128, MinimumLength = 12)] string NewPassword);

public sealed record CreateWorkshopUserRequest
{
    [Required]
    [StringLength(50, MinimumLength = 3)]
    public string Username { get; init; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string FullName { get; init; } = string.Empty;

    [Required]
    public string Role { get; init; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 12)]
    public string Password { get; init; } = string.Empty;

    public bool IsActive { get; init; } = true;
}

public sealed record UpdateWorkshopUserRequest(
    [param: Required, StringLength(100)] string FullName,
    [param: Required] string Role,
    bool IsActive);

public sealed record ResetPasswordRequest(
    [param: Required, StringLength(128, MinimumLength = 12)] string NewPassword);

public sealed record AuthenticatedUserResponse(
    int Id,
    string Username,
    string FullName,
    string Role,
    int? CustomerId = null);

public sealed record WorkshopUserResponse(
    int Id,
    string Username,
    string FullName,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc);
