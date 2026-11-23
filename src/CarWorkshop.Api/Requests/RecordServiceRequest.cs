using System.ComponentModel.DataAnnotations;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Api.Requests;

public sealed class RecordServiceRequest
{
    [Required(ErrorMessage = "Enter the mileage in kilometres.")]
    [Range(0, int.MaxValue, ErrorMessage = "Enter a whole mileage of zero or greater.")]
    public int? Mileage { get; init; }

    public int[] ServiceIds { get; init; } = [];

    [StringLength(500)]
    public string? Notes { get; init; }

    [StringLength(ServiceRecord.MaxWorkLength)]
    public string? WorkPerformed { get; init; }
}
