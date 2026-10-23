using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/mechanics")]
public sealed class MechanicsController(MechanicService service)
    : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<MechanicDetails>>> GetAll(
        CancellationToken cancellationToken)
    {
        return Ok(await service.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<MechanicDetails>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        return Ok(await service.GetByIdAsync(id, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<MechanicDetails>> Create(
        MechanicRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.CreateAsync(
            ToCommand(request),
            cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { id = result.Id },
            result);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<MechanicDetails>> Update(
        int id,
        MechanicRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await service.UpdateAsync(
            id,
            ToCommand(request),
            cancellationToken));
    }

    private static MechanicCommand ToCommand(MechanicRequest request)
    {
        return new MechanicCommand(
            request.FullName,
            request.Phone,
            request.IsActive);
    }
}