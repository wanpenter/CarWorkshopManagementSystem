using System.Security.Claims;
using CarWorkshop.Api.Authentication;
using CarWorkshop.Api.Requests;
using CarWorkshop.Api.Services;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Exceptions;
using CarWorkshop.Application.Services;
using CarWorkshop.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/portal")]
[Authorize(Policy = WorkshopAuthentication.CustomerPolicy)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class CustomerPortalController(
    WorkshopAuthService authService,
    CustomerService customers,
    VehicleService vehicles,
    CarWorkshop.Application.Services.AppointmentService appointments,
    ServiceCatalogue services) : ControllerBase
{
    [HttpGet("profile")]
    public async Task<ActionResult<CustomerSummary>> GetProfile(CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        return Ok(await customers.GetByIdAsync(customerId, cancellationToken));
    }

    [HttpPut("profile")]
    public async Task<ActionResult<CustomerSummary>> UpdateProfile(
        CustomerRequest request,
        CancellationToken cancellationToken)
    {
        var (userId, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        var updated = await authService.UpdateCustomerProfileAsync(
            userId,
            customerId,
            new CustomerCommand(request.FullName, request.Phone, request.Address),
            cancellationToken);
        return Ok(updated);
    }

    [HttpGet("services")]
    public async Task<ActionResult<IReadOnlyList<ServiceDetails>>> GetActiveServices(
        CancellationToken cancellationToken)
    {
        _ = await ResolveCustomerContextAsync(cancellationToken);
        var all = await services.GetAllAsync(cancellationToken);
        return Ok(all.Where(service => service.IsActive).ToArray());
    }

    [HttpGet("vehicles")]
    public async Task<ActionResult<IReadOnlyList<VehicleDetails>>> GetVehicles(
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        return Ok(await vehicles.GetAllAsync(customerId, cancellationToken));
    }

    [HttpPost("vehicles")]
    public async Task<ActionResult<VehicleDetails>> CreateVehicle(
        PortalVehicleRequest request,
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        var created = await vehicles.CreateAsync(
            new VehicleCommand(
                customerId,
                request.RegistrationNumber,
                request.Make,
                request.Model,
                request.Year,
                request.Mileage,
                request.IsActive),
            cancellationToken);
        return StatusCode(StatusCodes.Status201Created, created);
    }

    [HttpPut("vehicles/{id:int}")]
    public async Task<ActionResult<VehicleDetails>> UpdateVehicle(
        int id,
        PortalVehicleRequest request,
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        var updated = await vehicles.UpdateForCustomerAsync(
            id,
            customerId,
            new VehicleCommand(
                customerId,
                request.RegistrationNumber,
                request.Make,
                request.Model,
                request.Year,
                request.Mileage,
                request.IsActive),
            cancellationToken);
        return Ok(updated);
    }

    [HttpDelete("vehicles/{id:int}")]
    public async Task<IActionResult> DeleteVehicle(int id, CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        await vehicles.DeleteForCustomerAsync(id, customerId, cancellationToken);
        return NoContent();
    }

    [HttpGet("appointments")]
    public async Task<ActionResult<IReadOnlyList<AppointmentDetails>>> GetAppointments(
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        return Ok(await appointments.GetAllAsync(customerId, null, cancellationToken));
    }

    [HttpGet("appointments/{id:int}")]
    public async Task<ActionResult<AppointmentDetails>> GetAppointmentById(
        int id,
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        return Ok(await appointments.GetByIdForCustomerAsync(id, customerId, cancellationToken));
    }

    [HttpPost("appointments")]
    public async Task<ActionResult<AppointmentDetails>> CreateAppointment(
        PortalCreateAppointmentRequest request,
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        var created = await appointments.CreateForCustomerAsync(
            customerId,
            request.VehicleId,
            request.ScheduledAtUtc,
            request.ServiceIds,
            request.Notes,
            cancellationToken);
        return CreatedAtAction(nameof(GetAppointmentById), new { id = created.Id }, created);
    }

    [HttpPost("appointments/{id:int}/cancel")]
    public async Task<ActionResult<AppointmentDetails>> CancelAppointment(
        int id,
        PortalCancelAppointmentRequest? request,
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        return Ok(await appointments.CancelForCustomerAsync(
            id,
            customerId,
            request?.Reason,
            cancellationToken));
    }

    [HttpPost("appointments/{id:int}/receipt-printed")]
    public async Task<IActionResult> LogReceiptPrinted(
        int id,
        CancellationToken cancellationToken)
    {
        var (_, customerId) = await ResolveCustomerContextAsync(cancellationToken);
        await appointments.LogReceiptPrintedForCustomerAsync(id, customerId, cancellationToken);
        return NoContent();
    }

    private async Task<(int UserId, int CustomerId)> ResolveCustomerContextAsync(CancellationToken cancellationToken)
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdValue, out var userId))
        {
            throw new ForbiddenException("Customer account context is missing.");
        }

        var user = await authService.GetUserAsync(userId, cancellationToken);
        if (user is null || !user.IsActive || user.Role != WorkshopUser.CustomerRole || user.CustomerId is not > 0)
        {
            throw new ForbiddenException("A linked customer portal account is required.");
        }

        return (user.Id, user.CustomerId.Value);
    }
}
