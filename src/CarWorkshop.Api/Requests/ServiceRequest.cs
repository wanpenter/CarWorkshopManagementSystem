using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Requests;

public sealed class ServiceRequest
{
    [Required, StringLength(100, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; init; }

    [Range(0, 99999999.99)]
    public decimal CurrentPrice { get; init; }

    [Range(1, 540)]
    public int EstimatedDurationMinutes { get; init; }

    public bool IsActive { get; init; } = true;
}
