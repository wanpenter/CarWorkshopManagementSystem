namespace CarWorkshop.Application.Contracts;

public sealed record CreatePartCommand(
    string Sku,
    string Name,
    string? Description,
    decimal UnitPrice,
    int StockQuantity,
    int LowStockThreshold,
    bool IsActive);

public sealed record UpdatePartCommand(
    string Sku,
    string Name,
    string? Description,
    decimal UnitPrice,
    int LowStockThreshold,
    bool IsActive);

public sealed record PartDetails(
    int Id,
    string Sku,
    string Name,
    string? Description,
    decimal UnitPrice,
    int StockQuantity,
    int LowStockThreshold,
    bool IsLowStock,
    bool IsActive,
    DateTime CreatedAtUtc);
