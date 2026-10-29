using System.Security.Claims;
using CarWorkshop.Api.Authentication;
using CarWorkshop.Api.Models;
using CarWorkshop.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Policy = WorkshopAuthentication.AdminPolicy)]
public sealed class UsersController(WorkshopAuthService authService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WorkshopUserResponse>>> GetAll(
        CancellationToken cancellationToken)
    {
        return Ok(await authService.GetUsersAsync(cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<WorkshopUserResponse>> Create(
        CreateWorkshopUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await authService.CreateUserAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, user);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<WorkshopUserResponse>> Update(
        int id,
        UpdateWorkshopUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await authService.UpdateUserAsync(
            id,
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
            request,
            cancellationToken);
        return Ok(user);
    }

    [HttpPost("{id:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(
        int id,
        ResetPasswordRequest request,
        CancellationToken cancellationToken)
    {
        await authService.ResetPasswordAsync(id, request.NewPassword, cancellationToken);
        return NoContent();
    }
}
