using System.Globalization;
using CarWorkshop.Api.Authentication;
using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using CarWorkshop.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = WorkshopAuthentication.StaffOrAdminPolicy)]
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

    [HttpGet("availability")]
    public async Task<ActionResult<DayAvailabilityDetails>> GetAvailability(
        [FromQuery] string? date,
        [FromQuery] int durationMinutes = 30,
        [FromQuery] int? vehicleId = null,
        [FromQuery] int? excludeAppointmentId = null,
        CancellationToken cancellationToken = default)
    {
        var parsedDate = ParseDate(date);
        return Ok(await _appointments.GetAvailableSlotsAsync(
            parsedDate,
            durationMinutes,
            vehicleId,
            excludeAppointmentId,
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

    [HttpPut("{id:int}/mechanic")]
    public async Task<ActionResult<AppointmentDetails>> AssignMechanic(
        int id,
        AssignMechanicRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.AssignMechanicAsync(id, request.MechanicId, cancellationToken));
    }

    [HttpPost("{id:int}/status")]
    public async Task<ActionResult<AppointmentDetails>> TransitionStatus(
        int id,
        TransitionAppointmentStatusRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.TransitionStatusAsync(
            id,
            ParseRequiredStatus(request.Status),
            request.Reason,
            cancellationToken));
    }

    [HttpPost("{id:int}/receipt-printed")]
    public async Task<IActionResult> LogReceiptPrinted(
        int id,
        CancellationToken cancellationToken)
    {
        await _appointments.LogReceiptPrintedAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:int}/service-record")]
    public async Task<ActionResult<AppointmentDetails>> RecordService(
        int id,
        RecordServiceRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.RecordServiceAsync(
            id,
            request.Mileage!.Value,
            request.ServiceIds,
            request.Notes,
            request.WorkPerformed,
            request.NextServiceMileage,
            cancellationToken));
    }

    [HttpPost("{id:int}/parts")]
    public async Task<ActionResult<AppointmentDetails>> AddPartUsage(
        int id,
        AddAppointmentPartRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.AddPartUsageAsync(
            id,
            request.PartId,
            request.Quantity,
            cancellationToken));
    }

    [HttpDelete("{id:int}/parts/{partLineId:int}")]
    public async Task<ActionResult<AppointmentDetails>> RemovePartUsage(
        int id,
        int partLineId,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.RemovePartUsageAsync(
            id,
            partLineId,
            cancellationToken));
    }

    [HttpPost("{id:int}/payment")]
    public async Task<ActionResult<AppointmentDetails>> RecordPayment(
        int id,
        RecordPaymentRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _appointments.RecordPaymentAsync(
            id,
            request.Amount,
            ParseRequiredPaymentMethod(request.Method),
            request.Reference,
            cancellationToken));
    }

    private static DateOnly ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) ||
            !DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            throw new ArgumentException("Date must be in YYYY-MM-DD format.", "date");
        }

        return parsed;
    }

    private static PaymentMethod ParseRequiredPaymentMethod(string value)
    {
        if (!Enum.TryParse<PaymentMethod>(value, ignoreCase: false, out var method) ||
            !Enum.IsDefined(method))
        {
            throw new ArgumentException("Payment method is invalid.", "method");
        }

        return method;
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
