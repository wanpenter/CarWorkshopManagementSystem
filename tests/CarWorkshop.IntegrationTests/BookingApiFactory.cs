using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using MySqlConnector;

namespace CarWorkshop.IntegrationTests;

public sealed class BookingApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _databaseName = $"cw_it_{Guid.NewGuid():N}";
    private string _adminConnectionString = string.Empty;
    private string _connectionString = string.Empty;
    private int _day;
    private bool _databaseCreated;
    private readonly BookingClock _clock = new();

    public const string AdminUsername = "integration.admin";
    public const string AdminPassword = "Integration!Admin#2039";

    public HttpClient Client { get; private set; } = null!;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(logging => logging.SetMinimumLevel(LogLevel.Warning));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<CarWorkshopDbContext>();
            services.RemoveAll<DbContextOptions<CarWorkshopDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<CarWorkshopDbContext>>();
            services.AddDbContext<CarWorkshopDbContext>(options =>
                options.UseMySql(_connectionString, new MySqlServerVersion(new Version(8, 0, 46))));
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_clock);
        });
    }

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("WORKSHOP_TEST_MYSQL");
        if (string.IsNullOrWhiteSpace(configured))
            throw new InvalidOperationException(
                "Set WORKSHOP_TEST_MYSQL to a dedicated MySQL 8 test server connection string. " +
                "The account needs CREATE/DROP DATABASE permission. See tests/CarWorkshop.IntegrationTests/README.md.");

        var connection = new MySqlConnectionStringBuilder(configured) { Database = string.Empty };
        _adminConnectionString = connection.ConnectionString;
        await using (var admin = new MySqlConnection(connection.ConnectionString))
        {
            await admin.OpenAsync();
            await using var create = admin.CreateCommand();
            create.CommandText = $"CREATE DATABASE `{_databaseName}` CHARACTER SET utf8mb4";
            await create.ExecuteNonQueryAsync();
            _databaseCreated = true;
        }

        connection.Database = _databaseName;
        _connectionString = connection.ConnectionString;
        try
        {
            using var startupClient = CreateAnonymousClient();
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CarWorkshopDbContext>();
            await db.Database.MigrateAsync();
            var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<WorkshopUser>>();
            var admin = WorkshopUser.Create(
                AdminUsername, "Integration Administrator", "Admin", "pending", _clock.GetUtcNow().UtcDateTime);
            admin.ChangePasswordHash(passwordHasher.HashPassword(admin, AdminPassword));
            db.WorkshopUsers.Add(admin);
            await db.SaveChangesAsync();

            Client = await LoginAsync(AdminUsername, AdminPassword);
        }
        catch
        {
            await DropTestDatabaseAsync();
            throw;
        }
    }

    public HttpClient CreateAnonymousClient(bool handleCookies = true) => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        AllowAutoRedirect = false,
        HandleCookies = handleCookies
    });

    public async Task<HttpClient> LoginAsync(string username, string password)
    {
        var client = CreateAnonymousClient();
        try
        {
            await RefreshCsrfAsync(client);
            using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password });
            response.EnsureSuccessStatusCode();
            await RefreshCsrfAsync(client);
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    public async Task RefreshCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<CsrfTokenResponse>()
            ?? throw new InvalidOperationException("The CSRF endpoint returned an empty response.");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.Token);
    }

    public async Task<TestAccount> CreateAccountAsync(
        string role = "Staff",
        bool isActive = true,
        string? username = null,
        string? password = null,
        string? fullName = null)
    {
        var suffix = Guid.NewGuid().ToString("N")[..10];
        username ??= $"test.{suffix}";
        password ??= $"Valid!Pass#{suffix}";
        fullName ??= $"Test {role} {suffix}";

        using var response = await Client.PostAsJsonAsync("/api/users", new
        {
            username,
            fullName,
            password,
            role,
            isActive
        });
        response.EnsureSuccessStatusCode();
        var user = await response.Content.ReadFromJsonAsync<UserResponse>()
            ?? throw new InvalidOperationException("The create-user endpoint returned an empty response.");
        return new TestAccount(user.Id, username, fullName, password, role, isActive);
    }

    public void AdvanceClock(TimeSpan by) => _clock.Advance(by);

    public async Task<BookingScenario> SeedAsync(int vehicleCount = 1, bool activeService = true)
    {
        var day = Interlocked.Increment(ref _day);
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CarWorkshopDbContext>();
        var now = new DateTime(2039, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var customer = Customer.Create("Integration customer", "0123456789", null, now);
        var otherCustomer = Customer.Create("Other owner", "0123456788", null, now);
        var service = new Service($"Oil change {day}", null, 120.50m, 60, activeService);
        db.AddRange(customer, otherCustomer, service);
        await db.SaveChangesAsync();

        var vehicles = Enumerable.Range(0, vehicleCount).Select(index => Vehicle.Create(
            customer.Id, $"T{customer.Id}V{index}", "Perodua", "Myvi", 2020, 1000, true, now)).ToArray();
        db.Vehicles.AddRange(vehicles);
        await db.SaveChangesAsync();
        var start = new DateTime(2040, 1, 1, 1, 0, 0, DateTimeKind.Utc)
            .AddDays(day * 2);
        return new BookingScenario(customer.Id, otherCustomer.Id,
            vehicles.Select(vehicle => vehicle.Id).ToArray(), service.Id, service.Name, start);
    }

    public async Task<int> CountBookingsAsync(int customerId)
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<CarWorkshopDbContext>()
            .Appointments.CountAsync(appointment => appointment.CustomerId == customerId);
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        try { await base.DisposeAsync(); }
        finally { await DropTestDatabaseAsync(); }
    }

    private async Task DropTestDatabaseAsync()
    {
        if (!_databaseCreated)
            return;

        await using var admin = new MySqlConnection(_adminConnectionString);
        await admin.OpenAsync();
        await using var drop = admin.CreateCommand();
        // The name is generated by this fixture; a configured database is never a cleanup target.
        drop.CommandText = $"DROP DATABASE `{_databaseName}`";
        await drop.ExecuteNonQueryAsync();
        _databaseCreated = false;
    }

    private sealed class BookingClock : TimeProvider
    {
        private DateTimeOffset _utcNow = new(2039, 1, 1, 0, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public void Advance(TimeSpan by) => _utcNow = _utcNow.Add(by);
    }

    private sealed record CsrfTokenResponse(string Token);
    private sealed record UserResponse(int Id);
}

public sealed record TestAccount(
    int Id,
    string Username,
    string FullName,
    string Password,
    string Role,
    bool IsActive);

public sealed record BookingScenario(int CustomerId, int OtherCustomerId,
    int[] VehicleIds, int ServiceId, string ServiceName, DateTime StartUtc)
{
    public object Request(int vehicleIndex = 0, DateTime? startUtc = null, int? customerId = null) => new
    {
        CustomerId = customerId ?? CustomerId,
        VehicleId = VehicleIds[vehicleIndex],
        ScheduledAtUtc = startUtc ?? StartUtc,
        ServiceIds = new[] { ServiceId }
    };

    public object Update(string status, DateTime? startUtc = null) => new
    {
        CustomerId,
        VehicleId = VehicleIds[0],
        ScheduledAtUtc = startUtc ?? StartUtc,
        ServiceIds = new[] { ServiceId },
        Status = status
    };
}
