using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class UnitOfWork : IUnitOfWork
{
    private readonly CarWorkshopDbContext _context;

    public UnitOfWork(CarWorkshopDbContext context)
    {
        _context = context;
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
        {
            throw new DuplicateRegistrationException();
        }
        catch (DbUpdateException exception) when (IsForeignKeyConstraintViolation(exception))
        {
            var addedOrModifiedVehicle = _context.ChangeTracker.Entries<Vehicle>()
                .FirstOrDefault(entry => entry.State is EntityState.Added or EntityState.Modified);

            if (addedOrModifiedVehicle is not null)
            {
                throw new EntityNotFoundException(
                    "Customer",
                    addedOrModifiedVehicle.Entity.CustomerId);
            }

            throw new ConflictException(
                "This customer cannot be deleted while vehicles are still linked to them.");
        }
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception)
    {
        return GetMySqlErrorNumber(exception) == 1062 ||
               GetSqliteExtendedErrorCode(exception) is 1555 or 2067;
    }

    private static bool IsForeignKeyConstraintViolation(DbUpdateException exception)
    {
        return GetMySqlErrorNumber(exception) is 1451 or 1452 ||
               GetSqliteExtendedErrorCode(exception) == 787;
    }

    private static int? GetMySqlErrorNumber(DbUpdateException exception)
    {
        var innerException = FindInnerException(exception, "MySqlConnector.MySqlException");
        return ReadIntegerProperty(innerException, "Number");
    }

    private static int? GetSqliteExtendedErrorCode(DbUpdateException exception)
    {
        var innerException = FindInnerException(exception, "Microsoft.Data.Sqlite.SqliteException");
        return ReadIntegerProperty(innerException, "SqliteExtendedErrorCode");
    }

    private static Exception? FindInnerException(Exception exception, string fullTypeName)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current.GetType().FullName == fullTypeName)
            {
                return current;
            }
        }

        return null;
    }

    private static int? ReadIntegerProperty(Exception? exception, string propertyName)
    {
        return exception?.GetType().GetProperty(propertyName)?.GetValue(exception) as int?;
    }
}
