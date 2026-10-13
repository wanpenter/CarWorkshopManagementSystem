using Microsoft.EntityFrameworkCore;
using CarWorkshop.Infrastructure.Data;
using CarWorkshop.Api.Services;
using CarWorkshop.Api.Middleware;
using CarWorkshop.Application.Interfaces;
using CarWorkshop.Application.Services;
using CarWorkshop.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

var connectionString =
    builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<CarWorkshopDbContext>(options =>
    options.UseMySql(
        connectionString,
        new MySqlServerVersion(new Version(8, 0, 46))
    ));

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddScoped<CarService>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IVehicleRepository, VehicleRepository>();
builder.Services.AddScoped<IAppointmentRepository, AppointmentRepository>();
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddScoped<VehicleService>();
builder.Services.AddScoped<AppointmentService>();
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
        policy.WithOrigins(frontendOrigins)
            .WithMethods("GET", "POST", "PUT", "DELETE")
            .WithHeaders("Content-Type");
}));
var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseMiddleware<ApiExceptionMiddleware>();
app.UseCors("Frontend");
app.MapControllers();


app.MapGet("/api/health", () =>
{
    return Results.Ok(new
    {
        status = "ok"
    });
});
app.Run();

public partial class Program;

