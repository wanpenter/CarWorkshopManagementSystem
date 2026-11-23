using System.Security.Claims;
using CarWorkshop.Api.Authentication;
using CarWorkshop.Api.Models;
using CarWorkshop.Api.Services;
using CarWorkshop.Domain.Entities;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/auth")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AuthController(
    WorkshopAuthService authService,
    IAntiforgery antiforgery,
    TimeProvider timeProvider) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("csrf")]
    public IActionResult Csrf()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new { token = tokens.RequestToken });
    }

    [AllowAnonymous]
    [EnableRateLimiting("Login")]
    [HttpPost("login")]
    public async Task<ActionResult<AuthenticatedUserResponse>> Login(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request.Username, request.Password, cancellationToken);
        if (result is null)
        {
            return UnauthorizedProblem();
        }

        await SignInSessionAsync(result);
        return Ok(WorkshopAuthService.ToAuthenticatedResponse(result.User));
    }

    [AllowAnonymous]
    [EnableRateLimiting("Login")]
    [HttpPost("staff/login")]
    public async Task<ActionResult<AuthenticatedUserResponse>> StaffLogin(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(
            request.Username,
            request.Password,
            [WorkshopUser.AdminRole, WorkshopUser.StaffRole],
            "Staff",
            cancellationToken);
        if (result is null)
        {
            return UnauthorizedProblem();
        }

        await SignInSessionAsync(result);
        return Ok(WorkshopAuthService.ToAuthenticatedResponse(result.User));
    }

    [AllowAnonymous]
    [EnableRateLimiting("Login")]
    [HttpPost("customer/login")]
    public async Task<ActionResult<AuthenticatedUserResponse>> CustomerLogin(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(
            request.Username,
            request.Password,
            [WorkshopUser.CustomerRole],
            "Customer",
            cancellationToken);
        if (result is null)
        {
            return UnauthorizedProblem();
        }

        await SignInSessionAsync(result);
        return Ok(WorkshopAuthService.ToAuthenticatedResponse(result.User));
    }

    [AllowAnonymous]
    [EnableRateLimiting("Login")]
    [HttpPost("register")]
    public async Task<ActionResult<AuthenticatedUserResponse>> Register(
        RegisterCustomerRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.RegisterCustomerAsync(request, cancellationToken);
        await SignInSessionAsync(result);
        return StatusCode(StatusCodes.Status201Created, WorkshopAuthService.ToAuthenticatedResponse(result.User));
    }

    private Task SignInSessionAsync(LoginResult result)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, result.User.Id.ToString()),
            new(ClaimTypes.Name, result.User.Username),
            new(ClaimTypes.GivenName, result.User.FullName),
            new(ClaimTypes.Role, result.User.Role),
            new(WorkshopAuthentication.SessionIdClaim, result.Session.Id.ToString())
        };
        if (result.User.CustomerId.HasValue)
        {
            claims.Add(new Claim(WorkshopAuthentication.CustomerIdClaim, result.User.CustomerId.Value.ToString()));
        }

        var principal = new ClaimsPrincipal(
            new ClaimsIdentity(claims, WorkshopAuthentication.Scheme));
        return HttpContext.SignInAsync(
            WorkshopAuthentication.Scheme,
            principal,
            new AuthenticationProperties
            {
                AllowRefresh = false,
                IsPersistent = false,
                IssuedUtc = timeProvider.GetUtcNow(),
                ExpiresUtc = new DateTimeOffset(result.Session.ExpiresAtUtc)
            });
    }

    [HttpGet("me")]
    public async Task<ActionResult<AuthenticatedUserResponse>> Me(CancellationToken cancellationToken)
    {
        var user = await authService.GetUserAsync(CurrentUserId(), cancellationToken);
        return user is null ? UnauthorizedProblem() : Ok(WorkshopAuthService.ToAuthenticatedResponse(user));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        var sessionId = User.FindFirstValue(WorkshopAuthentication.SessionIdClaim);
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            await authService.RevokeSessionAsync(sessionId, cancellationToken);
        }

        await HttpContext.SignOutAsync(WorkshopAuthentication.Scheme);
        return NoContent();
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        await authService.ChangePasswordAsync(
            CurrentUserId(),
            request.CurrentPassword,
            request.NewPassword,
            cancellationToken);
        await HttpContext.SignOutAsync(WorkshopAuthentication.Scheme);
        return NoContent();
    }

    private int CurrentUserId()
    {
        return int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    }

    private UnauthorizedObjectResult UnauthorizedProblem()
    {
        return Unauthorized(new ProblemDetails
        {
            Status = StatusCodes.Status401Unauthorized,
            Title = "Unauthorized",
            Detail = "Invalid credentials or session.",
            Instance = Request.Path
        });
    }
}
