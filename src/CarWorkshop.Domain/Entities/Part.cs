using System.Text.RegularExpressions;

namespace CarWorkshop.Domain.Entities;

public sealed partial class Part
{
    public const int MaxSkuLength = 40;
    public const int MaxNameLength = 120;
    public const int MaxDescriptionLength = 500;
    public const int MaxStockQuantity = 1_000_000;

    private Part() { }

    public Part(
        string sku,
        string name,
        string? description,
        decimal unitPrice,
        int stockQuantity,
        int lowStockThreshold,
        bool isActive,
        DateTime createdAtUtc)
    {
        if (stockQuantity < 0 || stockQuantity > MaxStockQuantity)
            throw new ArgumentOutOfRangeException(nameof(stockQuantity), $"Stock quantity must be between 0 and {MaxStockQuantity:N0}.");
        if (createdAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Time must be UTC.", nameof(createdAtUtc));

        Update(sku, name, description, unitPrice, lowStockThreshold, isActive);
        StockQuantity = stockQuantity;
        CreatedAtUtc = createdAtUtc;
    }

    public int Id { get; private set; }
    public string Sku { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public decimal UnitPrice { get; private set; }
    public int StockQuantity { get; private set; }
    public int LowStockThreshold { get; private set; }
    public bool IsActive { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    public bool IsLowStock => StockQuantity <= LowStockThreshold;

    public void Update(
        string sku,
        string name,
        string? description,
        decimal unitPrice,
        int lowStockThreshold,
        bool isActive)
    {
        var normalizedSku = NormalizeSku(sku);
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > MaxNameLength)
            throw new ArgumentException($"Part name must be between 1 and {MaxNameLength} characters.", nameof(name));
        if (description?.Trim().Length > MaxDescriptionLength)
            throw new ArgumentException($"Description cannot exceed {MaxDescriptionLength} characters.", nameof(description));
        if (unitPrice < 0m || unitPrice > 99_999_999.99m)
            throw new ArgumentOutOfRangeException(nameof(unitPrice), "Unit price must be 0 or greater.");
        if (lowStockThreshold < 0 || lowStockThreshold > 100_000)
            throw new ArgumentOutOfRangeException(nameof(lowStockThreshold), "Low-stock threshold must be between 0 and 100,000.");

        Sku = normalizedSku;
        Name = name.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        UnitPrice = decimal.Round(unitPrice, 2, MidpointRounding.AwayFromZero);
        LowStockThreshold = lowStockThreshold;
        IsActive = isActive;
    }

    public void AdjustStock(int delta)
    {
        if (delta == 0)
            throw new ArgumentException("Stock adjustment cannot be zero.", nameof(delta));

        var next = (long)StockQuantity + delta;
        if (next < 0)
            throw new InvalidOperationException($"Cannot reduce stock for {Name} ({Sku}) below zero. Available: {StockQuantity}.");
        if (next > MaxStockQuantity)
            throw new InvalidOperationException($"Stock quantity cannot exceed {MaxStockQuantity:N0}.");

        StockQuantity = (int)next;
    }

    public void DeductStock(int quantity)
    {
        if (quantity < 1 || quantity > 1000)
            throw new ArgumentOutOfRangeException(nameof(quantity), "Quantity must be between 1 and 1,000.");
        if (StockQuantity < quantity)
            throw new InvalidOperationException($"Insufficient stock for {Name} ({Sku}). Available: {StockQuantity}, requested: {quantity}.");

        StockQuantity -= quantity;
    }

    public void Restock(int quantity)
    {
        if (quantity < 1 || quantity > 1000)
            throw new ArgumentOutOfRangeException(nameof(quantity), "Quantity must be between 1 and 1,000.");
        if ((long)StockQuantity + quantity > MaxStockQuantity)
            throw new InvalidOperationException($"Stock quantity cannot exceed {MaxStockQuantity:N0}.");

        StockQuantity += quantity;
    }

    private static string NormalizeSku(string sku)
    {
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("SKU is required.", nameof(sku));
        var normalized = sku.Trim().ToUpperInvariant();
        if (normalized.Length > MaxSkuLength)
            throw new ArgumentException($"SKU cannot exceed {MaxSkuLength} characters.", nameof(sku));
        if (!SkuPattern().IsMatch(normalized))
            throw new ArgumentException("SKU can only use letters, numbers, hyphens, underscores, or periods.", nameof(sku));
        return normalized;
    }

    [GeneratedRegex("^[A-Z0-9._-]+$")]
    private static partial Regex SkuPattern();
}
