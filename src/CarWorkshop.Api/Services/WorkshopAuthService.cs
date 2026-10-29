using CarWorkshop.Api.Models;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Api.Services;

public sealed class WorkshopAuthService(
    CarWorkshopDbContext db,
    IPasswordHasher<WorkshopUser> passwordHasher,
    TimeProvider timeProvider)
{
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(8);
    private static readonly WorkshopUser DummyUser = WorkshopUser.Create(
        "timing-check",
        "Timing Check",
        WorkshopUser.StaffRole,
        "pending",
        DateTime.UnixEpoch);
    private static readonly string DummyPasswordHash =
        new PasswordHasher<WorkshopUser>().HashPassword(DummyUser, "not-a-real-account-password");

    public async Task<LoginResult?> LoginAsync(
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        string normalizedUsername;
        try
        {
            normalizedUsername = WorkshopUser.NormalizeUsername(username);
        }
        catch (ArgumentException)
        {
            VerifyDummyPassword(password);
            return null;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var lockedUsers = await db.WorkshopUsers
            .FromSqlInterpolated(
                $"SELECT * FROM `WorkshopUsers` WHERE `NormalizedUsername` = {normalizedUsername} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var user = lockedUsers.SingleOrDefault();
        var now = UtcNow();

        if (user is null || !user.IsActive || user.IsLockedOut(now))
        {
            VerifyDummyPassword(password);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var suppliedPassword = password ?? string.Empty;
        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, suppliedPassword);
        if (verification == PasswordVerificationResult.Failed)
        {
            user.RegisterFailedLogin(now);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        user.ClearFailedLogins();
        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.ChangePasswordHash(passwordHasher.HashPassword(user, suppliedPassword));
        }

        var session = WorkshopSession.Create(user.Id, now, now.Add(SessionLifetime));
        db.WorkshopSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new LoginResult(user, session);
    }

    public async Task RevokeSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        var session = await db.WorkshopSessions.SingleOrDefaultAsync(
            item => item.Id == sessionId,
            cancellationToken);
        if (session is null)
        {
            return;
        }

        session.Revoke(UtcNow());
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ChangePasswordAsync(
        int userId,
        string currentPassword,
        string newPassword,
        CancellationToken cancellationToken)
    {
        ValidatePassword(newPassword, nameof(newPassword));

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var user = await LockedUserAsync(userId, cancellationToken)
            ?? throw new InvalidOperationException("Authenticated user no longer exists.");
        var verification = passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            currentPassword ?? string.Empty);
        if (verification == PasswordVerificationResult.Failed)
        {
            throw new ArgumentException("Current password is incorrect.", nameof(currentPassword));
        }

        user.ChangePasswordHash(passwordHasher.HashPassword(user, newPassword));
        await RevokeAllSessionsAsync(user.Id, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<WorkshopUserResponse>> GetUsersAsync(CancellationToken cancellationToken)
    {
        return await db.WorkshopUsers
            .AsNoTracking()
            .OrderBy(user => user.Username)
            .Select(user => ToUserResponse(user))
            .ToListAsync(cancellationToken);
    }

    public async Task<WorkshopUser?> GetUserAsync(int userId, CancellationToken cancellationToken)
    {
        return await db.WorkshopUsers
            .AsNoTracking()
            .SingleOrDefaultAsync(user => user.Id == userId, cancellationToken);
    }

    public async Task<WorkshopUserResponse> CreateUserAsync(
        CreateWorkshopUserRequest request,
        CancellationToken cancellationToken)
    {
        ValidatePassword(request.Password, nameof(request.Password));
        var now = UtcNow();
        var user = WorkshopUser.Create(request.Username, request.FullName, request.Role, "pending", now);
        user.ChangePasswordHash(passwordHasher.HashPassword(user, request.Password));
        if (!request.IsActive)
        {
            user.UpdateAccess(user.FullName, user.Role, false);
        }

        db.WorkshopUsers.Add(user);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
        {
            throw new ConflictException("A user with that username already exists.");
        }

        return ToUserResponse(user);
    }

    public async Task<WorkshopUserResponse> UpdateUserAsync(
        int targetUserId,
        int actingUserId,
        UpdateWorkshopUserRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var activeAdmins = await db.WorkshopUsers
            .FromSqlRaw(
                "SELECT * FROM `WorkshopUsers` WHERE `Role` = 'Admin' AND `IsActive` = TRUE FOR UPDATE")
            .ToListAsync(cancellationToken);
        var target = activeAdmins.SingleOrDefault(user => user.Id == targetUserId)
            ?? await LockedUserAsync(targetUserId, cancellationToken)
            ?? throw new EntityNotFoundException("User", targetUserId);

        var wouldRemainActiveAdmin = request.IsActive && request.Role == WorkshopUser.AdminRole;
        if (targetUserId == actingUserId && !wouldRemainActiveAdmin)
        {
            throw new ConflictException("You cannot demote or deactivate your own account.");
        }

        if (target.IsActive && target.Role == WorkshopUser.AdminRole &&
            !wouldRemainActiveAdmin && activeAdmins.Count == 1)
        {
            throw new ConflictException("The last active administrator cannot be demoted or deactivated.");
        }

        var accessChanged = target.Role != request.Role || target.IsActive != request.IsActive;
        target.UpdateAccess(request.FullName, request.Role, request.IsActive);
        if (accessChanged)
        {
            await RevokeAllSessionsAsync(target.Id, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToUserResponse(target);
    }

    public async Task ResetPasswordAsync(
        int userId,
        string newPassword,
        CancellationToken cancellationToken)
    {
        ValidatePassword(newPassword, nameof(newPassword));
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var user = await LockedUserAsync(userId, cancellationToken)
            ?? throw new EntityNotFoundException("User", userId);
        user.ChangePasswordHash(passwordHasher.HashPassword(user, newPassword));
        await RevokeAllSessionsAsync(user.Id, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task BootstrapFirstAdminAsync(
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        ValidatePassword(password, nameof(password));
        await using var transaction = await db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable,
            cancellationToken);
        if (await db.WorkshopUsers.AnyAsync(cancellationToken))
        {
            throw new InvalidOperationException("Bootstrap refused because at least one workshop user already exists.");
        }

        var user = WorkshopUser.Create(
            username,
            username,
            WorkshopUser.AdminRole,
            "pending",
            UtcNow());
        user.ChangePasswordHash(passwordHasher.HashPassword(user, password));
        db.WorkshopUsers.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public static AuthenticatedUserResponse ToAuthenticatedResponse(WorkshopUser user)
    {
        return new AuthenticatedUserResponse(user.Id, user.Username, user.FullName, user.Role);
    }

    private async Task<WorkshopUser?> LockedUserAsync(int userId, CancellationToken cancellationToken)
    {
        var users = await db.WorkshopUsers
            .FromSqlInterpolated($"SELECT * FROM `WorkshopUsers` WHERE `Id` = {userId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        return users.SingleOrDefault();
    }

    private async Task RevokeAllSessionsAsync(int userId, CancellationToken cancellationToken)
    {
        var now = UtcNow();
        await db.WorkshopSessions
            .Where(session => session.WorkshopUserId == userId && session.RevokedAtUtc == null)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(session => session.RevokedAtUtc, now),
                cancellationToken);
    }

    private DateTime UtcNow() => timeProvider.GetUtcNow().UtcDateTime;

    private static WorkshopUserResponse ToUserResponse(WorkshopUser user)
    {
        return new WorkshopUserResponse(
            user.Id,
            user.Username,
            user.FullName,
            user.Role,
            user.IsActive,
            user.CreatedAtUtc);
    }

    private static void ValidatePassword(string password, string parameterName)
    {
        ArgumentNullException.ThrowIfNull(password, parameterName);
        if (password.Length is < 12 or > 128)
        {
            throw new ArgumentException("Password must be between 12 and 128 characters.", parameterName);
        }
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception)
    {
        return exception.InnerException?.Message.Contains("Duplicate entry", StringComparison.OrdinalIgnoreCase) == true;
    }

    private void VerifyDummyPassword(string? password)
    {
        _ = passwordHasher.VerifyHashedPassword(
            DummyUser,
            DummyPasswordHash,
            password ?? string.Empty);
    }
}

public sealed record LoginResult(WorkshopUser User, WorkshopSession Session);
