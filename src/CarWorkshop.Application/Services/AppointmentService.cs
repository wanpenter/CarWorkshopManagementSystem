using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Application.Services;

public sealed class AppointmentService
{
    private readonly IAppointmentRepository _appointments;
    private readonly ICustomerRepository _customers;
    private readonly IVehicleRepository _vehicles;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _timeProvider;

    public AppointmentService(
        IAppointmentRepository appointments,
        ICustomerRepository customers,
        IVehicleRepository vehicles,
        IUnitOfWork unitOfWork,
        TimeProvider timeProvider)
    {
        _appointments = appointments;
        _customers = customers;
        _vehicles = vehicles;
        _unitOfWork = unitOfWork;
        _timeProvider = timeProvider;
    }

    public async Task<IReadOnlyList<AppointmentDetails>> GetAllAsync(
        int? customerId,
        AppointmentStatus? status,
        CancellationToken cancellationToken = default)
    {
        if (customerId.HasValue)
        {
            await FindCustomerAsync(customerId.Value, cancellationToken);
        }

        var appointments = await _appointments.GetAllAsync(customerId, status, cancellationToken);
        return appointments.Select(ToDetails).ToArray();
    }

    public async Task<AppointmentDetails> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return ToDetails(await FindAppointmentAsync(id, cancellationToken));
    }

    public async Task<AppointmentDetails> CreateAsync(
        AppointmentCommand command,
        CancellationToken cancellationToken = default)
    {
        if (command.Status != AppointmentStatus.Scheduled)
        {
            throw new ArgumentException(
                "A new appointment must have Scheduled status.",
                nameof(command.Status));
        }

        var customer = await FindCustomerAsync(command.CustomerId, cancellationToken);
        var vehicle = await FindVehicleAsync(command.VehicleId, cancellationToken);
        ValidateOwnership(command.CustomerId, vehicle);

        var nowUtc = _timeProvider.GetUtcNow().UtcDateTime;
        var appointment = Appointment.Create(
            command.CustomerId,
            command.VehicleId,
            command.ScheduledAtUtc,
            command.ServiceType,
            command.Notes,
            nowUtc,
            nowUtc);

        await _appointments.AddAsync(appointment, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDetails(appointment, customer, vehicle);
    }

    public async Task<AppointmentDetails> UpdateAsync(
        int id,
        AppointmentCommand command,
        CancellationToken cancellationToken = default)
    {
        var appointment = await FindAppointmentAsync(id, cancellationToken);
        var customer = await FindCustomerAsync(command.CustomerId, cancellationToken);
        var vehicle = await FindVehicleAsync(command.VehicleId, cancellationToken);
        if (command.CustomerId != appointment.CustomerId ||
            command.VehicleId != appointment.VehicleId)
        {
            ValidateOwnership(command.CustomerId, vehicle);
        }

        try
        {
            appointment.Update(
                command.CustomerId,
                command.VehicleId,
                command.ScheduledAtUtc,
                command.ServiceType,
                command.Notes,
                command.Status,
                _timeProvider.GetUtcNow().UtcDateTime);
        }
        catch (InvalidOperationException exception)
        {
            throw new ConflictException(exception.Message);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDetails(appointment, customer, vehicle);
    }

    private async Task<Appointment> FindAppointmentAsync(
        int id,
        CancellationToken cancellationToken)
    {
        return await _appointments.GetByIdAsync(id, cancellationToken)
            ?? throw new EntityNotFoundException("Appointment", id);
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

    private static void ValidateOwnership(int customerId, Vehicle vehicle)
    {
        if (vehicle.CustomerId != customerId)
        {
            throw new ArgumentException(
                "Vehicle does not belong to the selected customer.",
                "vehicleId");
        }
    }

    private static AppointmentDetails ToDetails(Appointment appointment)
    {
        return ToDetails(appointment, appointment.Customer, appointment.Vehicle);
    }

    private static AppointmentDetails ToDetails(
        Appointment appointment,
        Customer customer,
        Vehicle vehicle)
    {
        return new AppointmentDetails(
            appointment.Id,
            appointment.CustomerId,
            customer.FullName,
            appointment.VehicleId,
            vehicle.RegistrationNumber,
            $"{vehicle.Make} {vehicle.Model}",
            appointment.ScheduledAtUtc,
            appointment.ServiceType,
            appointment.Notes,
            appointment.Status.ToString(),
            appointment.CreatedAt);
    }
}
