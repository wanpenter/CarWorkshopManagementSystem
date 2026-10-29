using System.Threading.RateLimiting;
using CarWorkshop.Api.Authentication;
using CarWorkshop.Api.Middleware;
using CarWorkshop.Api.Services;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Application.Services;
using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using CarWorkshop.Infrastructure.Repositories;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var isDevelopmentOrTesting = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing");
var cookieSecurePolicy = isDevelopmentOrTesting
    ? CookieSecurePolicy.SameAsRequest
    : CookieSecurePolicy.Always;

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<CarWorkshopDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 46))));

builder.Services.AddOpenApi();
builder.Services.AddControllersWithViews(options =>
{
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
});
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = ".Workshop.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = cookieSecurePolicy;
});

builder.Services
    .AddAuthentication(WorkshopAuthentication.Scheme)
    .AddCookie(WorkshopAuthentication.Scheme, options =>
    {
        options.Cookie.Name = ".Workshop.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = cookieSecurePolicy;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = false;
        options.EventsType = typeof(WorkshopCookieEvents);
        options.LoginPath = "/api/auth/login";
        options.AccessDeniedPath = "/api/auth/forbidden";
    });
builder.Services.AddOptions<CookieAuthenticationOptions>(WorkshopAuthentication.Scheme)
    .Configure<TimeProvider>((options, timeProvider) => options.TimeProvider = timeProvider);
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build())
    .AddPolicy(WorkshopAuthentication.AdminPolicy, policy => policy.RequireRole(WorkshopUser.AdminRole));
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("Login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            AutoReplenishment = true,
            PermitLimit = 60,
            QueueLimit = 0,
            Window = TimeSpan.FromMinutes(1)
        }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Too many requests",
            Detail = "Too many login attempts. Try again shortly.",
            Instance = context.HttpContext.Request.Path
        }, cancellationToken);
    };
});

builder.Services.AddScoped<CarService>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddScoped<VehicleService>();
builder.Services.AddScoped<CarWorkshop.Application.Services.AppointmentService>();
builder.Services.AddScoped<ServiceCatalogue>();
builder.Services.AddScoped<MechanicService>();
builder.Services.AddScoped<WorkshopAuthService>();
builder.Services.AddScoped<WorkshopCookieEvents>();
builder.Services.AddScoped<IPasswordHasher<WorkshopUser>, PasswordHasher<WorkshopUser>>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IVehicleRepository, VehicleRepository>();
builder.Services.AddScoped<IAppointmentRepository, AppointmentRepository>();
builder.Services.AddScoped<IServiceRepository, ServiceRepository>();
builder.Services.AddScoped<IMechanicRepository, MechanicRepository>();
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => ApiExceptionMiddleware.ToCamelCase(entry.Key),
                entry => entry.Value!.Errors
                    .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                        ? "The value is invalid."
                        : error.ErrorMessage)
                    .ToArray());

        return new BadRequestObjectResult(new ValidationProblemDetails(errors)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "Validation failed",
            Instance = context.HttpContext.Request.Path
        });
    };
});

var frontendOrigins = builder.Configuration
    .GetSection("Frontend:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy =>
{
    if (frontendOrigins.Length > 0)
    {
        policy.WithOrigins(frontendOrigins)
            .WithMethods("GET", "POST", "PUT", "DELETE")
            .WithHeaders("Content-Type", "X-CSRF-TOKEN")
            .AllowCredentials();
    }
}));

var app = builder.Build();

if (args.Contains("--bootstrap-admin", StringComparer.Ordinal))
{
    try
    {
        var username = Environment.GetEnvironmentVariable("WORKSHOP_ADMIN_USERNAME");
        var password = Environment.GetEnvironmentVariable("WORKSHOP_ADMIN_PASSWORD");
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException(
                "WORKSHOP_ADMIN_USERNAME and WORKSHOP_ADMIN_PASSWORD are required for bootstrap.");
        }

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CarWorkshopDbContext>();
        await db.Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<WorkshopAuthService>()
            .BootstrapFirstAdminAsync(username, password, CancellationToken.None);
        Console.WriteLine("The first workshop administrator was created.");
        return;
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine($"Administrator bootstrap failed: {exception.Message}");
        Environment.ExitCode = 1;
        return;
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
{
    app.UseHttpsRedirection();
}

app.UseMiddleware<ApiExceptionMiddleware>();
app.UseRouting();
app.UseCors("Frontend");
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.Pragma = "no-cache";
    }

    await next();
});
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }))
    .AllowAnonymous();

await app.RunAsync();

public partial class Program;
