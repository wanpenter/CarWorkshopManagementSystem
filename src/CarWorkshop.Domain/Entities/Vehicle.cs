namespace CarWorkshop.Domain.Entities;

public sealed class Vehicle
{
    private Vehicle()
    {
    }

    private Vehicle(
        int customerId,
        string registrationNumber,
        string make,
        string model,
        int? year,
        int mileage,
        bool isActive,
        DateTime createdAt)
    {
        SetDetails(customerId, registrationNumber, make, model, year, mileage, isActive);
        CreatedAt = EnsureUtc(createdAt);
    }

    public int Id { get; private set; }

    public int CustomerId { get; private set; }

    public Customer Customer { get; private set; } = null!;

    public string RegistrationNumber { get; private set; } = string.Empty;

    public string Make { get; private set; } = string.Empty;

    public string Model { get; private set; } = string.Empty;

    public int? Year { get; private set; }

    public int Mileage { get; private set; }

    public bool IsActive { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public static Vehicle Create(
        int customerId,
        string registrationNumber,
        string make,
        string model,
        int? year,
        int mileage,
        bool isActive,
        DateTime createdAtUtc)
    {
        return new Vehicle(
            customerId,
            registrationNumber,
            make,
            model,
            year,
            mileage,
            isActive,
            createdAtUtc);
    }

    public void Update(
        int customerId,
        string registrationNumber,
        string make,
        string model,
        int? year,
        int mileage,
        bool isActive)
    {
        SetDetails(customerId, registrationNumber, make, model, year, mileage, isActive);
    }

    public static string NormalizeRegistrationNumber(string registrationNumber)
    {
        ArgumentNullException.ThrowIfNull(registrationNumber);

        var trimmed = registrationNumber.Trim();
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("Registration number is required.", nameof(registrationNumber));
        }

        if (trimmed.Any(character =>
                !IsAsciiLetterOrDigit(character) && !char.IsWhiteSpace(character) && character != '-'))
        {
            throw new ArgumentException(
                "Registration number can only contain ASCII letters, digits, whitespace, and hyphens.",
                nameof(registrationNumber));
        }

        var normalized = new string(
            trimmed
                .Where(character => !char.IsWhiteSpace(character) && character != '-')
                .Select(char.ToUpperInvariant)
                .ToArray());

        if (normalized.Length is 0 or > 20)
        {
            throw new ArgumentException(
                "Registration number must contain between 1 and 20 letters or digits.",
                nameof(registrationNumber));
        }

        return normalized;
    }

    private static bool IsAsciiLetterOrDigit(char character)
    {
        return character is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9';
    }

    private void SetDetails(
        int customerId,
        string registrationNumber,
        string make,
        string model,
        int? year,
        int mileage,
        bool isActive)
    {
        if (customerId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(customerId), "Customer is required.");
        }

        var maximumYear = DateTime.UtcNow.Year + 1;
        if (year is < 1900 || year > maximumYear)
        {
            throw new ArgumentOutOfRangeException(
                nameof(year),
                $"Year must be between 1900 and {maximumYear}.");
        }

        if (mileage < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(mileage), "Mileage cannot be negative.");
        }

        CustomerId = customerId;
        RegistrationNumber = NormalizeRegistrationNumber(registrationNumber);
        Make = RequiredTrimmed(make, 50, nameof(make));
        Model = RequiredTrimmed(model, 100, nameof(model));
        Year = year;
        Mileage = mileage;
        IsActive = isActive;
    }

    private static string RequiredTrimmed(string value, int maximumLength, string parameterName)
    {
        ArgumentNullException.ThrowIfNull(value, parameterName);

        var trimmed = value.Trim();
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("Value is required.", parameterName);
        }

        if (trimmed.Length > maximumLength)
        {
            throw new ArgumentException(
                $"Value cannot exceed {maximumLength} characters.",
                parameterName);
        }

        return trimmed;
    }

    private static DateTime EnsureUtc(DateTime value)
    {
        if (value.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Created time must be UTC.", nameof(value));
        }

        return value;
    }
}
