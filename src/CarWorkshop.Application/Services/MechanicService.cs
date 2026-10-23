using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class MechanicService(
    IMechanicRepository mechanics,
    IUnitOfWork unitOfWork)
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

        return ToDetails(mechanic);
    }

    public async Task<MechanicDetails> UpdateAsync(
        int id,
        MechanicCommand command,
        CancellationToken cancellationToken = default)
    {
        var mechanic = await mechanics.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Mechanic", id);

        mechanic.Update(command.FullName, command.Phone);
        mechanic.SetActive(command.IsActive);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ToDetails(mechanic);
    }

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