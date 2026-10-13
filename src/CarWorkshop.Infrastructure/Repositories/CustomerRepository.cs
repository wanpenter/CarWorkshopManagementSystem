using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CarWorkshop.Infrastructure.Repositories;

public sealed class CustomerRepository : ICustomerRepository
{
    private readonly CarWorkshopDbContext _context;

    public CustomerRepository(CarWorkshopDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<Customer>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        return await _context.Customers
            .AsNoTracking()
            .Include(customer => customer.Vehicles)
            .OrderBy(customer => customer.FullName)
            .ThenBy(customer => customer.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Customer?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return _context.Customers
            .Include(customer => customer.Vehicles)
            .SingleOrDefaultAsync(customer => customer.Id == id, cancellationToken);
    }

    public Task AddAsync(Customer customer, CancellationToken cancellationToken = default)
    {
        return _context.Customers.AddAsync(customer, cancellationToken).AsTask();
    }

    public Task<bool> HasVehiclesAsync(int id, CancellationToken cancellationToken = default)
    {
        return _context.Vehicles.AnyAsync(
            vehicle => vehicle.CustomerId == id,
            cancellationToken);
    }

    public Task<bool> HasAppointmentsAsync(int id, CancellationToken cancellationToken = default)
    {
        return _context.Appointments.AnyAsync(
            appointment => appointment.CustomerId == id,
            cancellationToken);
    }

    public void Remove(Customer customer)
    {
        _context.Customers.Remove(customer);
    }
}
