namespace CarWorkshop.Application.Contracts;

public sealed record MechanicCommand(
    string FullName,
    string Phone,
    bool IsActive);

public sealed record MechanicDetails(
    int Id,
    string FullName,
    string Phone,
    bool IsActive,
    DateTime CreatedAt);