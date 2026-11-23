using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CarWorkshop.IntegrationTests;

public sealed class AuditLogApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Audit_logs_endpoint_requires_admin_access()
    {
        using var anonymous = app.CreateAnonymousClient();
        using var anonResponse = await anonymous.GetAsync("/api/audit-logs");
        Assert.Equal(HttpStatusCode.Unauthorized, anonResponse.StatusCode);

        var staff = await app.CreateAccountAsync(role: "Staff");
        using var staffClient = await app.LoginAsync(staff.Username, staff.Password);
        using var staffResponse = await staffClient.GetAsync("/api/audit-logs");
        Assert.Equal(HttpStatusCode.Forbidden, staffResponse.StatusCode);

        using var adminResponse = await app.Client.GetAsync("/api/audit-logs");
        Assert.Equal(HttpStatusCode.OK, adminResponse.StatusCode);
    }

    [Fact]
    public async Task Booking_lifecycle_mechanic_assignment_and_service_record_write_accurate_audit_logs()
    {
        var staff = await app.CreateAccountAsync(role: "Staff");
        using var staffClient = await app.LoginAsync(staff.Username, staff.Password);
        var scenario = await app.SeedAsync();

        using var mechanicResponse = await staffClient.PostAsJsonAsync("/api/mechanics", new
        {
            fullName = "Audit Mechanic",
            phone = "0125551111",
            isActive = true
        });
        mechanicResponse.EnsureSuccessStatusCode();
        var mechanicId = (await mechanicResponse.Content.ReadFromJsonAsync<IdOnly>())!.Id;

        using var createResponse = await staffClient.PostAsJsonAsync("/api/appointments", new
        {
            customerId = scenario.CustomerId,
            vehicleId = scenario.VehicleIds[0],
            scheduledAtUtc = scenario.StartUtc,
            serviceIds = new[] { scenario.ServiceId },
            notes = "Audit booking"
        });
        createResponse.EnsureSuccessStatusCode();
        var appointmentId = (await createResponse.Content.ReadFromJsonAsync<IdOnly>())!.Id;

        using var confirmResponse = await staffClient.PutAsJsonAsync($"/api/appointments/{appointmentId}", new
        {
            customerId = scenario.CustomerId,
            vehicleId = scenario.VehicleIds[0],
            scheduledAtUtc = scenario.StartUtc,
            serviceIds = new[] { scenario.ServiceId },
            notes = "Audit booking",
            status = "Confirmed"
        });
        confirmResponse.EnsureSuccessStatusCode();

        using var assignResponse = await staffClient.PutAsJsonAsync(
            $"/api/appointments/{appointmentId}/mechanic",
            new { mechanicId });
        assignResponse.EnsureSuccessStatusCode();

        foreach (var status in new[] { "InProgress", "Completed" })
        {
            using var step = await staffClient.PutAsJsonAsync($"/api/appointments/{appointmentId}", new
            {
                customerId = scenario.CustomerId,
                vehicleId = scenario.VehicleIds[0],
                scheduledAtUtc = scenario.StartUtc,
                serviceIds = new[] { scenario.ServiceId },
                notes = "Audit booking",
                status
            });
            step.EnsureSuccessStatusCode();
        }

        using var recordResponse = await staffClient.PostAsJsonAsync(
            $"/api/appointments/{appointmentId}/service-record",
            new { mileage = 64200, serviceIds = new[] { scenario.ServiceId }, notes = "Filter replaced" });
        recordResponse.EnsureSuccessStatusCode();

        using var logsResponse = await app.Client.GetAsync(
            $"/api/audit-logs?entityType=Appointment&search={appointmentId}&page=1&pageSize=20");
        Assert.Equal(HttpStatusCode.OK, logsResponse.StatusCode);

        using var body = JsonDocument.Parse(await logsResponse.Content.ReadAsStringAsync());
        var items = body.RootElement.GetProperty("items")
            .EnumerateArray()
            .Where(item => item.GetProperty("entityId").GetInt32() == appointmentId)
            .ToArray();

        Assert.Contains(items, item =>
            item.GetProperty("action").GetString() == "Appointment.Created" &&
            item.GetProperty("actorUsername").GetString() == staff.Username);

        Assert.Contains(items, item =>
            item.GetProperty("action").GetString() == "Appointment.StatusChanged" &&
            item.GetProperty("oldValues").GetProperty("status").GetString() == "Requested" &&
            item.GetProperty("newValues").GetProperty("status").GetString() == "Confirmed");

        Assert.Contains(items, item =>
            item.GetProperty("action").GetString() == "Appointment.MechanicAssigned" &&
            item.GetProperty("newValues").GetProperty("mechanicName").GetString() == "Audit Mechanic");

        Assert.Contains(items, item =>
            item.GetProperty("action").GetString() == "Appointment.ServiceRecorded" &&
            item.GetProperty("newValues").GetProperty("mileage").GetInt32() == 64200);
    }

    [Fact]
    public async Task Failed_business_conflicts_do_not_create_fake_audit_entries()
    {
        var scenario = await app.SeedAsync();
        using var createResponse = await app.Client.PostAsJsonAsync("/api/appointments", new
        {
            customerId = scenario.CustomerId,
            vehicleId = scenario.VehicleIds[0],
            scheduledAtUtc = scenario.StartUtc,
            serviceIds = new[] { scenario.ServiceId },
            notes = "Conflict test"
        });
        createResponse.EnsureSuccessStatusCode();
        var appointmentId = (await createResponse.Content.ReadFromJsonAsync<IdOnly>())!.Id;

        // Invalid transition: Requested directly to Completed must return 409 and write no status-change log.
        using var invalidTransition = await app.Client.PutAsJsonAsync($"/api/appointments/{appointmentId}", new
        {
            customerId = scenario.CustomerId,
            vehicleId = scenario.VehicleIds[0],
            scheduledAtUtc = scenario.StartUtc,
            serviceIds = new[] { scenario.ServiceId },
            notes = "Conflict test",
            status = "Completed"
        });
        Assert.Equal(HttpStatusCode.Conflict, invalidTransition.StatusCode);

        using var logsResponse = await app.Client.GetAsync(
            $"/api/audit-logs?entityType=Appointment&search={appointmentId}&page=1&pageSize=20");
        logsResponse.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(await logsResponse.Content.ReadAsStringAsync());
        var matching = body.RootElement.GetProperty("items")
            .EnumerateArray()
            .Where(item => item.GetProperty("entityId").GetInt32() == appointmentId)
            .ToArray();

        Assert.Single(matching);
        Assert.Equal("Appointment.Created", matching[0].GetProperty("action").GetString());
    }

    [Fact]
    public async Task User_audit_logs_never_expose_passwords_and_support_pagination()
    {
        var secretPassword = "SuperSecret!Password#9988";
        var resetSecret = "BrandNewSecret!Pass#7766";
        var account = await app.CreateAccountAsync(password: secretPassword);

        using var resetResponse = await app.Client.PostAsJsonAsync(
            $"/api/users/{account.Id}/reset-password",
            new { newPassword = resetSecret });
        Assert.Equal(HttpStatusCode.NoContent, resetResponse.StatusCode);

        using var page1 = await app.Client.GetAsync(
            $"/api/audit-logs?entityType=User&search={Uri.EscapeDataString(account.Username)}&page=1&pageSize=1");
        Assert.Equal(HttpStatusCode.OK, page1.StatusCode);
        var rawJson = await page1.Content.ReadAsStringAsync();

        Assert.DoesNotContain(secretPassword, rawJson, StringComparison.Ordinal);
        Assert.DoesNotContain(resetSecret, rawJson, StringComparison.Ordinal);
        Assert.DoesNotContain("passwordHash", rawJson, StringComparison.OrdinalIgnoreCase);

        using var doc = JsonDocument.Parse(rawJson);
        Assert.Equal(1, doc.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(1, doc.RootElement.GetProperty("pageSize").GetInt32());
        Assert.True(doc.RootElement.GetProperty("totalCount").GetInt32() >= 2);
        Assert.True(doc.RootElement.GetProperty("totalPages").GetInt32() >= 2);
        Assert.Single(doc.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(
            "User.PasswordReset",
            doc.RootElement.GetProperty("items")[0].GetProperty("action").GetString());
    }

    private sealed record IdOnly(int Id);
}
