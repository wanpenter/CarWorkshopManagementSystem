using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class VehiclesController : ControllerBase
{
    private readonly VehicleService _vehicles;

    public VehiclesController(VehicleService vehicles)
    {
        _vehicles = vehicles;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<VehicleDetails>>> GetAll(
        [FromQuery] int? customerId,
        CancellationToken cancellationToken)
    {
        return Ok(await _vehicles.GetAllAsync(customerId, cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<VehicleDetails>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        return Ok(await _vehicles.GetByIdAsync(id, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<VehicleDetails>> Create(
        VehicleRequest request,
        CancellationToken cancellationToken)
    {
        var vehicle = await _vehicles.CreateAsync(ToCommand(request), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = vehicle.Id }, vehicle);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<VehicleDetails>> Update(
        int id,
        VehicleRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _vehicles.UpdateAsync(id, ToCommand(request), cancellationToken));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        await _vehicles.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    private static VehicleCommand ToCommand(VehicleRequest request)
    {
        return new VehicleCommand(
            request.CustomerId,
            request.RegistrationNumber,
            request.Make,
            request.Model,
            request.Year,
            request.Mileage,
            request.IsActive);
    }
}
