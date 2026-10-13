namespace CarWorkshop.Domain.Entities;

public sealed class Service
{
    private Service() { }

    public Service(string name, string? description, decimal currentPrice, int estimatedDurationMinutes, bool isActive = true)
    {
        Update(name, description, currentPrice, estimatedDurationMinutes, isActive);
    }

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public decimal CurrentPrice { get; private set; }
    public int EstimatedDurationMinutes { get; private set; }
    public bool IsActive { get; private set; }

    public void Update(string name, string? description, decimal currentPrice, int estimatedDurationMinutes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 100)
            throw new ArgumentException("Name must be between 1 and 100 characters.", nameof(name));
        if (description?.Trim().Length > 500)
            throw new ArgumentException("Description cannot exceed 500 characters.", nameof(description));
        if (currentPrice < 0 || currentPrice > 99999999.99m)
            throw new ArgumentOutOfRangeException(nameof(currentPrice));
        if (estimatedDurationMinutes < 1 || estimatedDurationMinutes > 540)
            throw new ArgumentOutOfRangeException(nameof(estimatedDurationMinutes), "Duration must be 1–540 minutes.");

        Name = name.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        CurrentPrice = currentPrice;
        EstimatedDurationMinutes = estimatedDurationMinutes;
        IsActive = isActive;
    }
}
