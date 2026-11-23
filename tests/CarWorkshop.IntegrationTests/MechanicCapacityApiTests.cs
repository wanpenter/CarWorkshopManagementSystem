using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CarWorkshop.Application.Contracts;

namespace CarWorkshop.IntegrationTests;

public sealed class EmptyMechanicsApiFactory : BookingApiFactory
{
    protected override int BaselineActiveMechanicCount => 0;
}

public sealed class MechanicCapacityApiTests(EmptyMechanicsApiFactory app)
    : IClassFixture<EmptyMechanicsApiFactory>
{
    [Fact]
    public async Task Booking_requires_at_least_one_active_mechanic_and_enforces_sweep_line_concurrency_and_start_guard()
    {
        var scenario = await app.SeedAsync(vehicleCount: 4);

        // 1. With 0 mechanics in the workshop, staff booking is rejected with 409 Conflict.
        using (var noMechanicBooking = await app.Client.PostAsJsonAsync("/api/appointments", scenario.Request(vehicleIndex: 0)))
        {
            await AssertConflictAsync(noMechanicBooking, "No active mechanics");
        }

        // 2. Customer self-booking is also rejected with 409 when only an INACTIVE mechanic exists.
        using (var inactiveCreate = await app.Client.PostAsJsonAsync("/api/mechanics", new
               {
                   FullName = "On Leave Mechanic",
                   Phone = "0120001111",
                   IsActive = false
               }))
        {
            Assert.Equal(HttpStatusCode.Created, inactiveCreate.StatusCode);
        }

        using var customerClient = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(customerClient);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using (var registerResp = await customerClient.PostAsJsonAsync("/api/auth/register", new
               {
                   username = $"cap.{suffix}",
                   fullName = "Capacity Customer",
                   phone = "0124448888",
                   password = "Customer!Pass#2039"
               }))
        {
            Assert.Equal(HttpStatusCode.Created, registerResp.StatusCode);
        }
        await app.RefreshCsrfAsync(customerClient);
        using var custVehicleResp = await customerClient.PostAsJsonAsync("/api/portal/vehicles", new
        {
            registrationNumber = $"CAP{suffix[..5].ToUpperInvariant()}",
            make = "Honda",
            model = "Jazz",
            year = 2022,
            mileage = 12000,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, custVehicleResp.StatusCode);
        var custVehicleId = (await custVehicleResp.Content.ReadFromJsonAsync<VehicleDetails>())!.Id;

        using (var custNoMechanic = await customerClient.PostAsJsonAsync("/api/portal/appointments", new
               {
                   vehicleId = custVehicleId,
                   scheduledAtUtc = scenario.StartUtc,
                   serviceIds = new[] { scenario.ServiceId }
               }))
        {
            await AssertConflictAsync(custNoMechanic, "No active mechanics");
        }

        // 3. Add 1 active mechanic -> 09:00-10:00 (Vehicle 0) succeeds, overlapping 09:30-10:30 (Vehicle 1) fails, adjacent 10:00-11:00 (Vehicle 1) succeeds.
        var mech1 = await CreateActiveMechanicAsync("Mechanic One", "0121110001");

        var b1 = await CreateBookingAsync(scenario, vehicleIndex: 0, startUtc: scenario.StartUtc);
        using (var over1 = await app.Client.PostAsJsonAsync("/api/appointments",
                   scenario.Request(vehicleIndex: 1, startUtc: scenario.StartUtc.AddMinutes(30))))
        {
            await AssertConflictAsync(over1, "All 1 active mechanic is already booked");
        }

        var b2 = await CreateBookingAsync(scenario, vehicleIndex: 1, startUtc: scenario.StartUtc.AddHours(1));

        // 4. Add 2nd active mechanic -> sweep-line allows 09:30-10:30 (Vehicle 2) because peak concurrency is 2 <= 2
        //    (overlaps b1 [09:00,10:00) AND b2 [10:00,11:00), but never 3 simultaneously!).
        _ = await CreateActiveMechanicAsync("Mechanic Two", "0121110002");
        _ = await CreateBookingAsync(scenario, vehicleIndex: 2, startUtc: scenario.StartUtc.AddMinutes(30));

        // 5. A 4th booking at 09:30-10:30 (Vehicle 3) pushes [09:30, 10:00) concurrency to 3 > 2 -> 409 Conflict!
        using (var over2 = await app.Client.PostAsJsonAsync("/api/appointments",
                   scenario.Request(vehicleIndex: 3, startUtc: scenario.StartUtc.AddMinutes(30))))
        {
            await AssertConflictAsync(over2, "All 2 active mechanics are already booked");
        }

        // 6. Cancelling b1 (09:00-10:00) still leaves 10:00-10:30 full (b2 + b3 = 2), so 09:30-10:30 stays rejected,
        //    while the freed 09:00-10:00 slot (peak 2 with b3 at 09:30-10:00) now succeeds!
        using (var cancelB1 = await app.Client.PostAsJsonAsync(
                   $"/api/appointments/{b1.Id}/status",
                   new { status = "Cancelled", reason = "Slot released" }))
        {
            Assert.Equal(HttpStatusCode.OK, cancelB1.StatusCode);
        }

        using (var stillFullHalfHour = await app.Client.PostAsJsonAsync("/api/appointments",
                   scenario.Request(vehicleIndex: 3, startUtc: scenario.StartUtc.AddMinutes(30))))
        {
            await AssertConflictAsync(stillFullHalfHour, "All 2 active mechanics are already booked");
        }

        _ = await CreateBookingAsync(scenario, vehicleIndex: 3, startUtc: scenario.StartUtc);

        // 7. Tahap 1: Starting work (InProgress) on b2 without an assigned mechanic is rejected on BOTH endpoints, then succeeds after assignment.
        using (var confirmB2 = await app.Client.PostAsJsonAsync(
                   $"/api/appointments/{b2.Id}/status",
                   new { status = "Confirmed" }))
        {
            Assert.Equal(HttpStatusCode.OK, confirmB2.StatusCode);
        }

        using (var startWithoutMechPost = await app.Client.PostAsJsonAsync(
                   $"/api/appointments/{b2.Id}/status",
                   new { status = "InProgress" }))
        {
            await AssertConflictAsync(startWithoutMechPost, "Assign a mechanic before starting work");
        }

        using (var startWithoutMechPut = await app.Client.PutAsJsonAsync(
                   $"/api/appointments/{b2.Id}",
                   new
                   {
                       b2.CustomerId,
                       b2.VehicleId,
                       b2.ScheduledAtUtc,
                       ServiceIds = new[] { scenario.ServiceId },
                       Status = "InProgress"
                   }))
        {
            await AssertConflictAsync(startWithoutMechPut, "Assign a mechanic before starting work");
        }

        using (var assignB2 = await app.Client.PutAsJsonAsync(
                   $"/api/appointments/{b2.Id}/mechanic",
                   new { mechanicId = mech1.Id }))
        {
            Assert.Equal(HttpStatusCode.OK, assignB2.StatusCode);
        }

        using (var startWithMech = await app.Client.PostAsJsonAsync(
                   $"/api/appointments/{b2.Id}/status",
                   new { status = "InProgress" }))
        {
            Assert.Equal(HttpStatusCode.OK, startWithMech.StatusCode);
        }
    }

    private async Task<MechanicDetails> CreateActiveMechanicAsync(string name, string phone)
    {
        using var response = await app.Client.PostAsJsonAsync("/api/mechanics", new
        {
            FullName = name,
            Phone = phone,
            IsActive = true
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MechanicDetails>())!;
    }

    private async Task<AppointmentDetails> CreateBookingAsync(
        BookingScenario scenario,
        int vehicleIndex,
        DateTime startUtc)
    {
        using var response = await app.Client.PostAsJsonAsync(
            "/api/appointments",
            scenario.Request(vehicleIndex: vehicleIndex, startUtc: startUtc));
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<AppointmentDetails>())!;
    }

    private static async Task AssertConflictAsync(HttpResponseMessage response, string expectedSubstring)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Conflict, $"Expected 409, got {(int)response.StatusCode}: {body}");
        using var json = JsonDocument.Parse(body);
        Assert.Contains(expectedSubstring, json.RootElement.GetProperty("detail").GetString());
    }
}
