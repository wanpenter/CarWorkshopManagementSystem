using System.ComponentModel.DataAnnotations;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Api.Requests;

public sealed class CreatePartRequest
{
    [Required, StringLength(Part.MaxSkuLength, MinimumLength = 1)]
    public string Sku { get; init; } = string.Empty;

    [Required, StringLength(Part.MaxNameLength, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;

    [StringLength(Part.MaxDescriptionLength)]
    public string? Description { get; init; }

    [Range(0, 99999999.99)]
    public decimal UnitPrice { get; init; }

    [Range(0, 1_000_000)]
    public int StockQuantity { get; init; }

    [Range(0, 1_000_000)]
    public int LowStockThreshold { get; init; } = 5;

    public bool IsActive { get; init; } = true;
}

public sealed class UpdatePartRequest
{
    [Required, StringLength(Part.MaxSkuLength, MinimumLength = 1)]
    public string Sku { get; init; } = string.Empty;

    [Required, StringLength(Part.MaxNameLength, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;

    [StringLength(Part.MaxDescriptionLength)]
    public string? Description { get; init; }

    [Range(0, 99999999.99)]
    public decimal UnitPrice { get; init; }

    [Range(0, 1_000_000)]
    public int LowStockThreshold { get; init; } = 5;

    public bool IsActive { get; init; } = true;
}

public sealed class AdjustPartStockRequest
{
    [Range(-1_000_000, 1_000_000)]
    public int Delta { get; init; }

    [StringLength(200)]
    public string? Reason { get; init; }
}

public sealed class AddAppointmentPartRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Choose a spare part.")]
    public int PartId { get; init; }

    [Range(1, 1_000, ErrorMessage = "Quantity must be between 1 and 1,000.")]
    public int Quantity { get; init; } = 1;
}

public sealed class RecordPaymentRequest
{
    [Range(0.01, 99999999.99, ErrorMessage = "Payment amount must be greater than zero.")]
    public decimal Amount { get; init; }

    [Required]
    public string Method { get; init; } = string.Empty;

    [StringLength(Invoice.MaxPaymentReferenceLength)]
    public string? Reference { get; init; }
}
