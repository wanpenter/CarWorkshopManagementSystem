namespace CarWorkshop.Domain.Entities;

public sealed class Mechanic
{
    private Mechanic()
    {
    }

    private Mechanic(string fullName, string phone, DateTime createdAtUtc)
    {
        SetDetails(fullName, phone);

        if (createdAtUtc.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException(
                "Created time must be UTC.",
                nameof(createdAtUtc));
        }

        CreatedAt = createdAtUtc;
        IsActive = true;
    }

    public int Id { get; private set; }

    public string FullName { get; private set; } = string.Empty;

    public string Phone { get; private set; } = string.Empty;

    public bool IsActive { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public static Mechanic Create(
        string fullName,
        string phone,
        DateTime createdAtUtc)
    {
        return new Mechanic(fullName, phone, createdAtUtc);
    }

    public void Update(string fullName, string phone)
    {
        SetDetails(fullName, phone);
    }

    public void SetActive(bool isActive)
    {
        IsActive = isActive;
    }

    private void SetDetails(string fullName, string phone)
    {
        var validName = RequiredTrimmed(fullName, 100, nameof(fullName));
        var validPhone = NormalizePhone(phone);

        FullName = validName;
        Phone = validPhone;
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

        if (digitCount is < 7 or > 15 ||
            value.Count(character => character == '+') > 1 ||
            (value.Contains('+') && value[0] != '+'))
        {
            throw new ArgumentException(
                "Phone must contain between 7 and 15 digits, with + only at the start.",
                nameof(phone));
        }

        return value;
    }

    private static string RequiredTrimmed(
        string value,
        int maximumLength,
        string parameterName)
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
}