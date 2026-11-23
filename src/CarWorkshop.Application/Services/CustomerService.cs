using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class CustomerService
{
    private readonly ICustomerRepository _customers;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _timeProvider;
    private readonly AuditLogService _auditLogs;

    public CustomerService(
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        TimeProvider timeProvider,
        AuditLogService auditLogs)
    {
        _customers = customers;
        _unitOfWork = unitOfWork;
        _timeProvider = timeProvider;
        _auditLogs = auditLogs;
    }

    public async Task<IReadOnlyList<CustomerSummary>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var customers = await _customers.GetAllAsync(cancellationToken);
        return customers.Select(ToSummary).ToArray();
    }

    public async Task<CustomerSummary> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var customer = await FindRequiredAsync(id, cancellationToken);
        return ToSummary(customer);
    }

    public async Task<CustomerSummary> CreateAsync(
        CustomerCommand command,
        CancellationToken cancellationToken = default)
    {
        var customer = Customer.Create(
            command.FullName,
            command.Phone,
            command.Address,
            _timeProvider.GetUtcNow().UtcDateTime);

        await _customers.AddAsync(customer, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditLogs.RecordAsync(
            "Customer.Created",
            "Customer",
            customer.Id,
            $"Created customer {customer.FullName}.",
            newValues: CustomerSnapshot(customer),
            cancellationToken: cancellationToken);
        return ToSummary(customer);
    }

    public async Task<CustomerSummary> UpdateAsync(
        int id,
        CustomerCommand command,
        CancellationToken cancellationToken = default)
    {
        var customer = await FindRequiredAsync(id, cancellationToken);
        var oldValues = CustomerSnapshot(customer);
        customer.Update(command.FullName, command.Phone, command.Address);
        await _auditLogs.StageAsync(
            "Customer.Updated",
            "Customer",
            customer.Id,
            $"Updated customer {customer.FullName}.",
            oldValues: oldValues,
            newValues: CustomerSnapshot(customer),
            cancellationToken: cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToSummary(customer);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var customer = await FindRequiredAsync(id, cancellationToken);
        if (await _customers.HasVehiclesAsync(id, cancellationToken))
        {
            throw new ConflictException(
                "This customer cannot be deleted while vehicles are still linked to them.");
        }

        if (await _customers.HasAppointmentsAsync(id, cancellationToken))
        {
            throw new ConflictException(
                "This customer cannot be deleted while appointments are still linked to them.");
        }

        if (await _customers.HasPortalAccountAsync(id, cancellationToken))
        {
            throw new ConflictException(
                "This customer cannot be deleted while a customer portal login is linked to them.");
        }

        var oldValues = CustomerSnapshot(customer);
        _customers.Remove(customer);
        await _auditLogs.StageAsync(
            "Customer.Deleted",
            "Customer",
            customer.Id,
            $"Deleted customer {customer.FullName}.",
            oldValues: oldValues,
            cancellationToken: cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static object CustomerSnapshot(Customer customer) => new
    {
        customer.FullName,
        customer.Phone,
        customer.Address
    };

    private async Task<Customer> FindRequiredAsync(
        int id,
        CancellationToken cancellationToken)
    {
        return await _customers.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Customer", id);
    }

    private static CustomerSummary ToSummary(Customer customer)
    {
        return new CustomerSummary(
            customer.Id,
            customer.FullName,
            customer.Phone,
            customer.Address,
            customer.CreatedAt,
            customer.Vehicles.Count);
    }
}
