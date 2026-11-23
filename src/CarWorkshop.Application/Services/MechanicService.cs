using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class MechanicService(
    IMechanicRepository mechanics,
    IUnitOfWork unitOfWork,
    AuditLogService auditLogs)
{
    public async Task<IReadOnlyList<MechanicDetails>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var records = await mechanics.GetAllAsync(cancellationToken);

        return records.Select(ToDetails).ToArray();
    }

    public async Task<MechanicDetails> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var mechanic = await mechanics.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Mechanic", id);

        return ToDetails(mechanic);
    }

    public async Task<MechanicDetails> CreateAsync(
        MechanicCommand command,
        CancellationToken cancellationToken = default)
    {
        var mechanic = Mechanic.Create(
            command.FullName,
            command.Phone,
            DateTime.UtcNow);

        mechanic.SetActive(command.IsActive);

        await mechanics.AddAsync(mechanic, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await auditLogs.RecordAsync(
            "Mechanic.Created",
            "Mechanic",
            mechanic.Id,
            $"Added mechanic {mechanic.FullName}.",
            newValues: MechanicSnapshot(mechanic),
            cancellationToken: cancellationToken);

        return ToDetails(mechanic);
    }

    public async Task<MechanicDetails> UpdateAsync(
        int id,
        MechanicCommand command,
        CancellationToken cancellationToken = default)
    {
        var mechanic = await mechanics.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Mechanic", id);

        var wasActive = mechanic.IsActive;
        var oldValues = MechanicSnapshot(mechanic);
        mechanic.Update(command.FullName, command.Phone);
        mechanic.SetActive(command.IsActive);

        var summary = wasActive != mechanic.IsActive
            ? (mechanic.IsActive ? $"Activated mechanic {mechanic.FullName}." : $"Deactivated mechanic {mechanic.FullName}.")
            : $"Updated mechanic {mechanic.FullName}.";
        await auditLogs.StageAsync(
            "Mechanic.Updated",
            "Mechanic",
            mechanic.Id,
            summary,
            oldValues: oldValues,
            newValues: MechanicSnapshot(mechanic),
            cancellationToken: cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ToDetails(mechanic);
    }

    private static object MechanicSnapshot(Mechanic mechanic) => new
    {
        mechanic.FullName,
        mechanic.Phone,
        mechanic.IsActive
    };

    private static MechanicDetails ToDetails(Mechanic mechanic)
    {
        return new MechanicDetails(
            mechanic.Id,
            mechanic.FullName,
            mechanic.Phone,
            mechanic.IsActive,
            mechanic.CreatedAt);
    }
}