namespace CarWorkshop.Application.Contracts;

public sealed record ServiceCommand(string Name, string? Description, decimal CurrentPrice,
    int EstimatedDurationMinutes, bool IsActive);

public sealed record ServiceDetails(int Id, string Name, string? Description, decimal CurrentPrice,
    int EstimatedDurationMinutes, bool IsActive);
