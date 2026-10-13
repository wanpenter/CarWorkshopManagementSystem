using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using CarWorkshop.Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AppointmentsController : ControllerBase
{
    private readonly CarWorkshop.Application.Services.AppointmentService _appointments;

    public AppointmentsController(CarWorkshop.Application.Services.AppointmentService appointments)
    {
        _appointments = appointments;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AppointmentDetails>>> GetAll(
        [FromQuery] int? customerId,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.GetAllAsync(
            customerId,
            ParseOptionalStatus(status),
            cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AppointmentDetails>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.GetByIdAsync(id, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<AppointmentDetails>> Create(
        CreateAppointmentRequest request,
        CancellationToken cancellationToken)
    {
        var appointment = await _appointments.CreateAsync(
            new AppointmentCommand(
                request.CustomerId,
                request.VehicleId,
                request.ScheduledAtUtc,
                request.ServiceIds,
                request.Notes,
                AppointmentStatus.Requested),
            cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = appointment.Id }, appointment);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<AppointmentDetails>> Update(
        int id,
        UpdateAppointmentRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.UpdateAsync(
            id,
            new AppointmentCommand(
                request.CustomerId,
                request.VehicleId,
                request.ScheduledAtUtc,
                request.ServiceIds,
                request.Notes,
                ParseRequiredStatus(request.Status)),
            cancellationToken));
    }

    private static AppointmentStatus? ParseOptionalStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return ParseRequiredStatus(value);
    }

    private static AppointmentStatus ParseRequiredStatus(string value)
    {
        if (!Enum.TryParse<AppointmentStatus>(value, ignoreCase: false, out var status) ||
            !Enum.IsDefined(status))
        {
            throw new ArgumentException(
                "Status is invalid.",
                "status");
        }

        return status;
    }
}
