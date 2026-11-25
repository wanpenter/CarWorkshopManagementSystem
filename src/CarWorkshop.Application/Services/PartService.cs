using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class PartService(
    IPartRepository parts,
    IAppointmentRepository appointments,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider,
    AuditLogService auditLogs)
{
    public async Task<IReadOnlyList<PartDetails>> GetAllAsync(CancellationToken cancellationToken = default) =>
        (await parts.GetAllAsync(cancellationToken)).Select(ToDetails).ToArray();

    public async Task<PartDetails> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        ToDetails(await parts.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Part", id));

    public async Task<PartDetails> CreateAsync(CreatePartCommand command, CancellationToken cancellationToken = default)
    {
        var part = new Part(
            command.Sku,
            command.Name,
            command.Description,
            command.UnitPrice,
            command.StockQuantity,
            command.LowStockThreshold,
            command.IsActive,
            timeProvider.GetUtcNow().UtcDateTime);
        await parts.AddAsync(part, cancellationToken);
        await SaveAsync(cancellationToken);
        await auditLogs.RecordAsync(
            "Part.Created",
            "Part",
            part.Id,
            $"Added spare part {part.Name} ({part.Sku}) with stock {part.StockQuantity}.",
            newValues: PartSnapshot(part),
            cancellationToken: cancellationToken);
        return ToDetails(part);
    }

    public async Task<PartDetails> UpdateAsync(int id, UpdatePartCommand command, CancellationToken cancellationToken = default)
    {
        var part = await parts.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Part", id);
        var oldValues = PartSnapshot(part);
        part.Update(
            command.Sku,
            command.Name,
            command.Description,
            command.UnitPrice,
            command.LowStockThreshold,
            command.IsActive);
        await auditLogs.StageAsync(
            "Part.Updated",
            "Part",
            part.Id,
            $"Updated spare part {part.Name} ({part.Sku}).",
            oldValues: oldValues,
            newValues: PartSnapshot(part),
            cancellationToken: cancellationToken);
        await SaveAsync(cancellationToken);
        return ToDetails(part);
    }

    public Task<PartDetails> AdjustStockAsync(
        int id,
        int delta,
        string? reason,
        CancellationToken cancellationToken = default) =>
        appointments.WithSchedulingLockAsync(async () =>
        {
            var part = await parts.GetByIdAsync(id, cancellationToken)
                ?? throw new EntityNotFoundException("Part", id);
            var previousStock = part.StockQuantity;
            try
            {
                part.AdjustStock(delta);
            }
            catch (InvalidOperationException exception)
            {
                throw new ConflictException(exception.Message);
            }

            var cleanReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
            if (cleanReason?.Length > 200)
                throw new ArgumentException("Reason cannot exceed 200 characters.", nameof(reason));

            var sign = delta > 0 ? $"+{delta}" : delta.ToString();
            var suffix = cleanReason is null ? string.Empty : $" Reason: {cleanReason}";
            await auditLogs.StageAsync(
                "Part.StockAdjusted",
                "Part",
                part.Id,
                $"Adjusted stock for {part.Name} ({part.Sku}) by {sign} ({previousStock} -> {part.StockQuantity}).{suffix}",
                oldValues: new { stockQuantity = previousStock },
                newValues: new { stockQuantity = part.StockQuantity, delta, reason = cleanReason },
                cancellationToken: cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return ToDetails(part);
        }, cancellationToken);

    private static object PartSnapshot(Part part) => new
    {
        part.Sku,
        part.Name,
        part.Description,
        part.UnitPrice,
        part.StockQuantity,
        part.LowStockThreshold,
        part.IsActive
    };

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try { await unitOfWork.SaveChangesAsync(cancellationToken); }
        catch (DuplicateRegistrationException)
        {
            throw new ConflictException("A spare part with this SKU already exists.");
        }
    }

    private static PartDetails ToDetails(Part part) => new(
        part.Id,
        part.Sku,
        part.Name,
        part.Description,
        part.UnitPrice,
        part.StockQuantity,
        part.LowStockThreshold,
        part.IsLowStock,
        part.IsActive,
        part.CreatedAtUtc);
}
