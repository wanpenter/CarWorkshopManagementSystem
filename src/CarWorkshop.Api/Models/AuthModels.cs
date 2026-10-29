using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Models;

public sealed record LoginRequest(
    [param: Required, StringLength(50)] string Username,
    [param: Required, StringLength(128)] string Password);

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
    string Role);

public sealed record WorkshopUserResponse(
    int Id,
    string Username,
    string FullName,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc);
