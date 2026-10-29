using System.Text.RegularExpressions;

namespace CarWorkshop.Domain.Entities;

public sealed partial class WorkshopUser
{
    public const string AdminRole = "Admin";
    public const string StaffRole = "Staff";

    private readonly List<WorkshopSession> _sessions = [];

    private WorkshopUser()
    {
    }

    private WorkshopUser(
        string username,
        string fullName,
        string role,
        string passwordHash,
        DateTime createdAtUtc)
    {
        Username = ValidateUsername(username);
        NormalizedUsername = NormalizeUsername(Username);
        FullName = ValidateFullName(fullName);
        Role = ValidateRole(role);
        PasswordHash = Required(passwordHash, nameof(passwordHash));
        IsActive = true;
        CreatedAtUtc = EnsureUtc(createdAtUtc, nameof(createdAtUtc));
    }

    public int Id { get; private set; }

    public string Username { get; private set; } = string.Empty;

    public string NormalizedUsername { get; private set; } = string.Empty;

    public string FullName { get; private set; } = string.Empty;

    public string PasswordHash { get; private set; } = string.Empty;

    public string Role { get; private set; } = StaffRole;

    public bool IsActive { get; private set; }

    public int FailedLoginCount { get; private set; }

    public DateTime? LockoutEndUtc { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyCollection<WorkshopSession> Sessions => _sessions;

    public static WorkshopUser Create(
        string username,
        string fullName,
        string role,
        string passwordHash,
        DateTime createdAtUtc)
    {
        return new WorkshopUser(username, fullName, role, passwordHash, createdAtUtc);
    }

    public static string NormalizeUsername(string username)
    {
        return ValidateUsername(username).ToUpperInvariant();
    }

    public void UpdateAccess(string fullName, string role, bool isActive)
    {
        FullName = ValidateFullName(fullName);
        Role = ValidateRole(role);
        IsActive = isActive;
    }

    public void ChangePasswordHash(string passwordHash)
    {
        PasswordHash = Required(passwordHash, nameof(passwordHash));
        ClearFailedLogins();
    }

    public void RegisterFailedLogin(DateTime nowUtc)
    {
        nowUtc = EnsureUtc(nowUtc, nameof(nowUtc));
        FailedLoginCount++;

        if (FailedLoginCount >= 5)
        {
            FailedLoginCount = 0;
            LockoutEndUtc = nowUtc.AddMinutes(15);
        }
    }

    public void ClearFailedLogins()
    {
        FailedLoginCount = 0;
        LockoutEndUtc = null;
    }

    public bool IsLockedOut(DateTime nowUtc)
    {
        return LockoutEndUtc is not null && LockoutEndUtc > EnsureUtc(nowUtc, nameof(nowUtc));
    }

    private static string ValidateUsername(string username)
    {
        var value = Required(username, nameof(username));
        if (value.Length is < 3 or > 50 || !UsernamePattern().IsMatch(value))
        {
            throw new ArgumentException(
                "Username must be 3 to 50 characters and contain only ASCII letters, numbers, periods, underscores, or hyphens.",
                nameof(username));
        }

        return value;
    }

    private static string ValidateFullName(string fullName)
    {
        var value = Required(fullName, nameof(fullName));
        if (value.Length > 100)
        {
            throw new ArgumentException("Full name cannot exceed 100 characters.", nameof(fullName));
        }

        return value;
    }

    private static string ValidateRole(string role)
    {
        var value = Required(role, nameof(role));
        if (value is not AdminRole and not StaffRole)
        {
            throw new ArgumentException("Role must be Admin or Staff.", nameof(role));
        }

        return value;
    }

    private static string Required(string value, string parameterName)
    {
        ArgumentNullException.ThrowIfNull(value, parameterName);
        var trimmed = value.Trim();
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("Value is required.", parameterName);
        }

        return trimmed;
    }

    private static DateTime EnsureUtc(DateTime value, string parameterName)
    {
        if (value.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Time must be UTC.", parameterName);
        }

        return value;
    }

    [GeneratedRegex("^[A-Za-z0-9._-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex UsernamePattern();
}
