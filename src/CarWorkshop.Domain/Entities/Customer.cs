namespace CarWorkshop.Domain.Entities;

public sealed class Customer
{
    private readonly List<Vehicle> _vehicles = [];

    private Customer()
    {
    }

    private Customer(string fullName, string phone, string? address, DateTime createdAt)
    {
        SetDetails(fullName, phone, address);
        CreatedAt = EnsureUtc(createdAt);
    }

    public int Id { get; private set; }

    public string FullName { get; private set; } = string.Empty;

    public string Phone { get; private set; } = string.Empty;

    public string? Address { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public IReadOnlyCollection<Vehicle> Vehicles => _vehicles;

    public static Customer Create(
        string fullName,
        string phone,
        string? address,
        DateTime createdAtUtc)
    {
        return new Customer(fullName, phone, address, createdAtUtc);
    }

    public void Update(string fullName, string phone, string? address)
    {
        SetDetails(fullName, phone, address);
    }

    private void SetDetails(string fullName, string phone, string? address)
    {
        FullName = RequiredTrimmed(fullName, 100, nameof(fullName));
        Phone = NormalizePhone(phone);
        Address = OptionalTrimmed(address, 500, nameof(address));
    }

    private static string NormalizePhone(string phone)
    {
        var value = RequiredTrimmed(phone, 20, nameof(phone));

        if (value.Any(character =>
                !(character >= '0' && character <= '9') &&
                character is not '+' and not ' ' and not '(' and not ')' and not '-'))
        {
            throw new ArgumentException(
                "Phone can only contain digits, spaces, +, parentheses, and hyphens.",
                nameof(phone));
        }

        var digitCount = value.Count(character => character is >= '0' and <= '9');
        if (digitCount is < 7 or > 15 || value.Count(character => character == '+') > 1 ||
            (value.Contains('+') && value[0] != '+'))
        {
            throw new ArgumentException("Phone must contain between 7 and 15 digits.", nameof(phone));
        }

        return value;
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

    private static string? OptionalTrimmed(string? value, int maximumLength, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
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
