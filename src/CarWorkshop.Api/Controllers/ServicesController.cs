using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class ServicesController(ServiceCatalogue catalogue) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ServiceDetails>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await catalogue.GetAllAsync(cancellationToken));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ServiceDetails>> GetById(int id, CancellationToken cancellationToken) =>
        Ok(await catalogue.GetByIdAsync(id, cancellationToken));

    [HttpPost]
    public async Task<ActionResult<ServiceDetails>> Create(ServiceRequest request, CancellationToken cancellationToken)
    {
        var result = await catalogue.CreateAsync(ToCommand(request), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ServiceDetails>> Update(int id, ServiceRequest request, CancellationToken cancellationToken) =>
        Ok(await catalogue.UpdateAsync(id, ToCommand(request), cancellationToken));

    private static ServiceCommand ToCommand(ServiceRequest request) => new(request.Name,
        request.Description, request.CurrentPrice, request.EstimatedDurationMinutes, request.IsActive);
}
