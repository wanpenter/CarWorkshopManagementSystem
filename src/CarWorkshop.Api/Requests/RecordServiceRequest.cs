using System.ComponentModel.DataAnnotations;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Api.Requests;

public sealed class RecordServiceRequest
{
    [Required(ErrorMessage = "Enter the mileage in kilometres.")]
    [Range(0, int.MaxValue, ErrorMessage = "Enter a whole mileage of zero or greater.")]
    public int? Mileage { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "Next service mileage must be a whole number greater than zero.")]
    public int? NextServiceMileage { get; init; }

    public int[] ServiceIds { get; init; } = [];

    [StringLength(500)]
    public string? Notes { get; init; }

    [StringLength(ServiceRecord.MaxWorkLength)]
    public string? WorkPerformed { get; init; }
}
