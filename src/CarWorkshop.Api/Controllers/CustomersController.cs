using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class CustomersController : ControllerBase
{
    private readonly CustomerService _customers;
    private readonly VehicleService _vehicles;

    public CustomersController(CustomerService customers, VehicleService vehicles)
    {
        _customers = customers;
        _vehicles = vehicles;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CustomerSummary>>> GetAll(
        CancellationToken cancellationToken)
    {
        return Ok(await _customers.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CustomerSummary>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        return Ok(await _customers.GetByIdAsync(id, cancellationToken));
    }

    [HttpGet("{id:int}/vehicles")]
    public async Task<ActionResult<IReadOnlyList<VehicleDetails>>> GetVehicles(
        int id,
        CancellationToken cancellationToken)
    {
        return Ok(await _vehicles.GetAllAsync(id, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<CustomerSummary>> Create(
        CustomerRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.CreateAsync(ToCommand(request), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = customer.Id }, customer);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CustomerSummary>> Update(
        int id,
        CustomerRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _customers.UpdateAsync(id, ToCommand(request), cancellationToken));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        await _customers.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    private static CustomerCommand ToCommand(CustomerRequest request)
    {
        return new CustomerCommand(request.FullName, request.Phone, request.Address);
    }
}
