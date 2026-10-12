namespace CarWorkshop.Application.Contracts;

public sealed record CustomerCommand(string FullName, string Phone, string? Address);

public sealed record CustomerSummary(
    int Id,
    string FullName,
    string Phone,
    string? Address,
    DateTime CreatedAt,
    int VehicleCount);
