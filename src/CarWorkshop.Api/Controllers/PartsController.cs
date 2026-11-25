using CarWorkshop.Api.Authentication;
using CarWorkshop.Api.Requests;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = WorkshopAuthentication.StaffOrAdminPolicy)]
public sealed class PartsController(PartService parts) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PartDetails>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await parts.GetAllAsync(cancellationToken));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PartDetails>> GetById(int id, CancellationToken cancellationToken) =>
        Ok(await parts.GetByIdAsync(id, cancellationToken));

    [HttpPost]
    public async Task<ActionResult<PartDetails>> Create(
        CreatePartRequest request,
        CancellationToken cancellationToken)
    {
        var created = await parts.CreateAsync(
            new CreatePartCommand(
                request.Sku,
                request.Name,
                request.Description,
                request.UnitPrice,
                request.StockQuantity,
                request.LowStockThreshold,
                request.IsActive),
            cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<PartDetails>> Update(
        int id,
        UpdatePartRequest request,
        CancellationToken cancellationToken) =>
        Ok(await parts.UpdateAsync(
            id,
            new UpdatePartCommand(
                request.Sku,
                request.Name,
                request.Description,
                request.UnitPrice,
                request.LowStockThreshold,
                request.IsActive),
            cancellationToken));

    [HttpPost("{id:int}/adjust-stock")]
    public async Task<ActionResult<PartDetails>> AdjustStock(
        int id,
        AdjustPartStockRequest request,
        CancellationToken cancellationToken) =>
        Ok(await parts.AdjustStockAsync(id, request.Delta, request.Reason, cancellationToken));
}
