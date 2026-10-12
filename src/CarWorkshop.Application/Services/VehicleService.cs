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

    public VehicleService(
        IVehicleRepository vehicles,
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        TimeProvider timeProvider)
    {
        _vehicles = vehicles;
        _customers = customers;
        _unitOfWork = unitOfWork;
        _timeProvider = timeProvider;
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

        vehicle.Update(
            command.CustomerId,
            normalizedRegistration,
            command.Make,
            command.Model,
            command.Year,
            command.Mileage,
            command.IsActive);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDetails(vehicle, customer.FullName);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var vehicle = await FindVehicleAsync(id, cancellationToken);
        _vehicles.Remove(vehicle);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

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
