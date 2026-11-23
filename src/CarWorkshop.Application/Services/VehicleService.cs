using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class VehicleService
{
    private readonly IVehicleRepository _vehicles;
    private readonly ICustomerRepository _customers;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _timeProvider;
    private readonly AuditLogService _auditLogs;

    public VehicleService(
        IVehicleRepository vehicles,
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        TimeProvider timeProvider,
        AuditLogService auditLogs)
    {
        _vehicles = vehicles;
        _customers = customers;
        _unitOfWork = unitOfWork;
        _timeProvider = timeProvider;
        _auditLogs = auditLogs;
    }

    public async Task<IReadOnlyList<VehicleDetails>> GetAllAsync(
        int? customerId,
        CancellationToken cancellationToken = default)
    {
        if (customerId.HasValue)
        {
            await FindCustomerAsync(customerId.Value, cancellationToken);
        }

        var vehicles = await _vehicles.GetAllAsync(customerId, cancellationToken);
        return vehicles.Select(vehicle => ToDetails(vehicle, vehicle.Customer.FullName)).ToArray();
    }

    public async Task<VehicleDetails> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(id, cancellationToken);
        return ToDetails(vehicle, vehicle.Customer.FullName);
    }

    public async Task<VehicleDetails> CreateAsync(
        VehicleCommand command,
        CancellationToken cancellationToken = default)
    {
        var customer = await FindCustomerAsync(command.CustomerId, cancellationToken);
        var normalizedRegistration = Vehicle.NormalizeRegistrationNumber(command.RegistrationNumber);

        if (await _vehicles.RegistrationExistsAsync(
                normalizedRegistration,
                cancellationToken: cancellationToken))
        {
            throw new DuplicateRegistrationException();
        }

        var vehicle = Vehicle.Create(
            command.CustomerId,
            normalizedRegistration,
            command.Make,
            command.Model,
            command.Year,
            command.Mileage,
            command.IsActive,
            _timeProvider.GetUtcNow().UtcDateTime);

        await _vehicles.AddAsync(vehicle, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditLogs.RecordAsync(
            "Vehicle.Created",
            "Vehicle",
            vehicle.Id,
            $"Registered vehicle {vehicle.RegistrationNumber} ({vehicle.Make} {vehicle.Model}) for {customer.FullName}.",
            newValues: VehicleSnapshot(vehicle),
            cancellationToken: cancellationToken);
        return ToDetails(vehicle, customer.FullName);
    }

    public async Task<VehicleDetails> UpdateAsync(
        int id,
        VehicleCommand command,
        CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(id, cancellationToken);
        var customer = await FindCustomerAsync(command.CustomerId, cancellationToken);
        var normalizedRegistration = Vehicle.NormalizeRegistrationNumber(command.RegistrationNumber);

        if (await _vehicles.RegistrationExistsAsync(
                normalizedRegistration,
                id,
                cancellationToken))
        {
            throw new DuplicateRegistrationException();
        }

        var oldValues = VehicleSnapshot(vehicle);
        vehicle.Update(
            command.CustomerId,
            normalizedRegistration,
            command.Make,
            command.Model,
            command.Year,
            command.Mileage,
            command.IsActive);

        await _auditLogs.StageAsync(
            "Vehicle.Updated",
            "Vehicle",
            vehicle.Id,
            $"Updated vehicle {vehicle.RegistrationNumber} ({vehicle.Make} {vehicle.Model}).",
            oldValues: oldValues,
            newValues: VehicleSnapshot(vehicle),
            cancellationToken: cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDetails(vehicle, customer.FullName);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(id, cancellationToken);
        if (await _vehicles.HasAppointmentsAsync(id, cancellationToken))
        {
            throw new ConflictException(
                "This vehicle cannot be deleted while appointments are still linked to it.");
        }

        var oldValues = VehicleSnapshot(vehicle);
        _vehicles.Remove(vehicle);
        await _auditLogs.StageAsync(
            "Vehicle.Deleted",
            "Vehicle",
            vehicle.Id,
            $"Deleted vehicle {vehicle.RegistrationNumber} ({vehicle.Make} {vehicle.Model}).",
            oldValues: oldValues,
            cancellationToken: cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<VehicleDetails> UpdateForCustomerAsync(
        int id,
        int customerId,
        VehicleCommand command,
        CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(id, cancellationToken);
        if (vehicle.CustomerId != customerId)
        {
            throw new ForbiddenException("You can only update your own vehicles.");
        }

        return await UpdateAsync(id, command with { CustomerId = customerId }, cancellationToken);
    }

    public async Task DeleteForCustomerAsync(
        int id,
        int customerId,
        CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(id, cancellationToken);
        if (vehicle.CustomerId != customerId)
        {
            throw new ForbiddenException("You can only delete your own vehicles.");
        }

        await DeleteAsync(id, cancellationToken);
    }

    private static object VehicleSnapshot(Vehicle vehicle) => new
    {
        vehicle.CustomerId,
        vehicle.RegistrationNumber,
        vehicle.Make,
        vehicle.Model,
        vehicle.Year,
        vehicle.Mileage,
        vehicle.IsActive
    };

    private async Task<Customer> FindCustomerAsync(
        int id,
        CancellationToken cancellationToken)
    {
        return await _customers.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Customer", id);
    }

    private async Task<Vehicle> FindVehicleAsync(
        int id,
        CancellationToken cancellationToken)
    {
        return await _vehicles.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Vehicle", id);
    }

    private static VehicleDetails ToDetails(Vehicle vehicle, string customerName)
    {
        return new VehicleDetails(
            vehicle.Id,
            vehicle.CustomerId,
            customerName,
            vehicle.RegistrationNumber,
            vehicle.Make,
            vehicle.Model,
            vehicle.Year,
            vehicle.Mileage,
            vehicle.IsActive,
            vehicle.CreatedAt);
    }
}
