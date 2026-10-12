namespace CarWorkshop.Application.Contracts;

public sealed record VehicleCommand(
    int CustomerId,
    string RegistrationNumber,
    string Make,
    string Model,
    int? Year,
    int Mileage,
    bool IsActive);

public sealed record VehicleDetails(
    int Id,
    int CustomerId,
    string CustomerName,
    string RegistrationNumber,
    string Make,
    string Model,
    int? Year,
    int Mileage,
    bool IsActive,
    DateTime CreatedAt);
