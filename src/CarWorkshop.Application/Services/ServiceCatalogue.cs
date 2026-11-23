using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class ServiceCatalogue(
    IServiceRepository services,
    IUnitOfWork unitOfWork,
    AuditLogService auditLogs)
{
    public async Task<IReadOnlyList<ServiceDetails>> GetAllAsync(CancellationToken cancellationToken = default) =>
        (await services.GetAllAsync(cancellationToken)).Select(ToDetails).ToArray();

    public async Task<ServiceDetails> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        ToDetails(await services.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Service", id));

    public async Task<ServiceDetails> CreateAsync(ServiceCommand command, CancellationToken cancellationToken = default)
    {
        var service = new Service(command.Name, command.Description, command.CurrentPrice,
            command.EstimatedDurationMinutes, command.IsActive);
        await services.AddAsync(service, cancellationToken);
        await SaveAsync(cancellationToken);
        await auditLogs.RecordAsync(
            "Service.Created",
            "Service",
            service.Id,
            $"Added catalogue service {service.Name}.",
            newValues: ServiceSnapshot(service),
            cancellationToken: cancellationToken);
        return ToDetails(service);
    }

    public async Task<ServiceDetails> UpdateAsync(int id, ServiceCommand command, CancellationToken cancellationToken = default)
    {
        var service = await services.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Service", id);
        var wasActive = service.IsActive;
        var oldValues = ServiceSnapshot(service);
        service.Update(command.Name, command.Description, command.CurrentPrice,
            command.EstimatedDurationMinutes, command.IsActive);
        var summary = wasActive != service.IsActive
            ? (service.IsActive ? $"Activated catalogue service {service.Name}." : $"Deactivated catalogue service {service.Name}.")
            : $"Updated catalogue service {service.Name}.";
        await auditLogs.StageAsync(
            "Service.Updated",
            "Service",
            service.Id,
            summary,
            oldValues: oldValues,
            newValues: ServiceSnapshot(service),
            cancellationToken: cancellationToken);
        await SaveAsync(cancellationToken);
        return ToDetails(service);
    }

    private static object ServiceSnapshot(Service service) => new
    {
        service.Name,
        service.Description,
        service.CurrentPrice,
        service.EstimatedDurationMinutes,
        service.IsActive
    };

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try { await unitOfWork.SaveChangesAsync(cancellationToken); }
        catch (DuplicateRegistrationException)
        {
            throw new ConflictException("A service with this name already exists.");
        }
    }

    private static ServiceDetails ToDetails(Service service) => new(service.Id, service.Name,
        service.Description, service.CurrentPrice, service.EstimatedDurationMinutes, service.IsActive);
}
