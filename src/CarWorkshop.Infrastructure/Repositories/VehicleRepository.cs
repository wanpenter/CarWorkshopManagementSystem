using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class VehicleRepository : IVehicleRepository
{
    private readonly CarWorkshopDbContext _context;

    public VehicleRepository(CarWorkshopDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<Vehicle>> GetAllAsync(
        int? customerId,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Vehicles
            .AsNoTracking()
            .Include(vehicle => vehicle.Customer)
            .AsQueryable();

        if (customerId.HasValue)
        {
            query = query.Where(vehicle => vehicle.CustomerId == customerId.Value);
        }

        return await query
            .OrderBy(vehicle => vehicle.RegistrationNumber)
            .ThenBy(vehicle => vehicle.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Vehicle?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return _context.Vehicles
            .Include(vehicle => vehicle.Customer)
            .SingleOrDefaultAsync(vehicle => vehicle.Id == id, cancellationToken);
    }

    public Task<bool> RegistrationExistsAsync(
        string normalizedRegistrationNumber,
        int? excludingVehicleId = null,
        CancellationToken cancellationToken = default)
    {
        return _context.Vehicles.AnyAsync(
            vehicle =>
                vehicle.RegistrationNumber == normalizedRegistrationNumber &&
                (!excludingVehicleId.HasValue || vehicle.Id != excludingVehicleId.Value),
            cancellationToken);
    }

    public Task AddAsync(Vehicle vehicle, CancellationToken cancellationToken = default)
    {
        return _context.Vehicles.AddAsync(vehicle, cancellationToken).AsTask();
    }

    public void Remove(Vehicle vehicle)
    {
        _context.Vehicles.Remove(vehicle);
    }
}
