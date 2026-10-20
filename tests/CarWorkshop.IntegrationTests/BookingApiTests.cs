using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CarWorkshop.Application.Contracts;

namespace CarWorkshop.IntegrationTests;

public sealed class BookingApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Create_persists_requested_booking_and_service_snapshot()
    {
        var scenario = await app.SeedAsync();
        var booking = await CreateAsync(scenario);
        var saved = await app.Client.GetFromJsonAsync<AppointmentDetails>($"/api/appointments/{booking.Id}");

        Assert.NotNull(saved);
        Assert.Equal(scenario.CustomerId, saved.CustomerId);
        Assert.Equal(scenario.VehicleIds[0], saved.VehicleId);
        Assert.Equal("Requested", saved.Status);
        Assert.Equal(scenario.StartUtc, saved.ScheduledAtUtc);
        Assert.Equal(DateTimeKind.Utc, saved.ScheduledAtUtc.Kind);
        Assert.Equal(scenario.StartUtc.AddHours(1), saved.EstimatedEndUtc);
        Assert.Collection(saved.Services, service =>
        {
            Assert.Equal(scenario.ServiceId, service.ServiceId);
            Assert.Equal(scenario.ServiceName, service.Name);
            Assert.Equal(120.50m, service.Price);
            Assert.Equal(60, service.DurationMinutes);
        });
        Assert.Equal(1, await app.CountBookingsAsync(scenario.CustomerId));
    }

    [Fact]
    public async Task Wrong_owner_returns_field_error_without_saving()
    {
        var scenario = await app.SeedAsync();
        using var response = await app.Client.PostAsJsonAsync("/api/appointments",
            scenario.Request(customerId: scenario.OtherCustomerId));

        await AssertValidationAsync(response, "vehicleId");
        Assert.Equal(0, await app.CountBookingsAsync(scenario.CustomerId));
        Assert.Equal(0, await app.CountBookingsAsync(scenario.OtherCustomerId));
    }

    [Theory]
    [InlineData(0, 0)] // 08:00 Malaysia time: before opening.
    [InlineData(0, 45)] // 08:45: outside the half-hour slots.
    [InlineData(9, 0)] // 17:00: a 60-minute service would finish after closing.
    public async Task Invalid_workshop_slot_returns_field_error_without_saving(int hour, int minute)
    {
        var scenario = await app.SeedAsync();
        var start = scenario.StartUtc.Date.AddHours(hour).AddMinutes(minute);
        using var response = await app.Client.PostAsJsonAsync("/api/appointments", scenario.Request(startUtc: start));

        await AssertValidationAsync(response, "scheduledAtUtc");
        Assert.Equal(0, await app.CountBookingsAsync(scenario.CustomerId));
    }

    [Theory]
    [InlineData(0, 30)]
    [InlineData(8, 30)]
    public async Task Opening_and_exact_closing_boundaries_are_accepted(int hour, int minute)
    {
        var scenario = await app.SeedAsync();
        var start = scenario.StartUtc.Date.AddHours(hour).AddMinutes(minute);
        var booking = await CreateAsync(scenario, startUtc: start);

        Assert.Equal(start.AddHours(1), booking.EstimatedEndUtc);
    }

    [Fact]
    public async Task Inactive_service_is_rejected_without_saving()
    {
        var scenario = await app.SeedAsync(activeService: false);
        using var response = await app.Client.PostAsJsonAsync("/api/appointments", scenario.Request());

        await AssertValidationAsync(response, "serviceIds");
        Assert.Equal(0, await app.CountBookingsAsync(scenario.CustomerId));
    }

    [Fact]
    public async Task Overlap_is_rejected_but_adjacent_booking_is_accepted()
    {
        var scenario = await app.SeedAsync();
        await CreateAsync(scenario);
        using var overlap = await app.Client.PostAsJsonAsync("/api/appointments",
            scenario.Request(startUtc: scenario.StartUtc.AddMinutes(30)));
        await AssertConflictAsync(overlap, "overlapping");

        await CreateAsync(scenario, startUtc: scenario.StartUtc.AddHours(1));
        Assert.Equal(2, await app.CountBookingsAsync(scenario.CustomerId));
    }

    [Fact]
    public async Task Concurrent_overlapping_requests_only_save_one_booking()
    {
        var scenario = await app.SeedAsync();
        var responses = await Task.WhenAll(
            app.Client.PostAsJsonAsync("/api/appointments", scenario.Request()),
            app.Client.PostAsJsonAsync("/api/appointments", scenario.Request()));
        try
        {
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
            await AssertConflictAsync(Assert.Single(responses,
                response => response.StatusCode == HttpStatusCode.Conflict), "overlapping");
            Assert.Equal(1, await app.CountBookingsAsync(scenario.CustomerId));
        }
        finally
        {
            foreach (var response in responses) response.Dispose();
        }
    }

    [Fact]
    public async Task Concurrent_requests_for_last_daily_slot_only_save_the_tenth_booking()
    {
        var scenario = await app.SeedAsync(vehicleCount: 11);
        for (var index = 0; index < 9; index++)
            await CreateAsync(scenario, vehicleIndex: index);

        var responses = await Task.WhenAll(
            app.Client.PostAsJsonAsync("/api/appointments", scenario.Request(vehicleIndex: 9)),
            app.Client.PostAsJsonAsync("/api/appointments", scenario.Request(vehicleIndex: 10)));
        try
        {
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
            await AssertConflictAsync(Assert.Single(responses,
                response => response.StatusCode == HttpStatusCode.Conflict), "10 active bookings");
            Assert.Equal(10, await app.CountBookingsAsync(scenario.CustomerId));
        }
        finally
        {
            foreach (var response in responses) response.Dispose();
        }

        await CreateAsync(scenario, vehicleIndex: 10, startUtc: scenario.StartUtc.AddDays(1));
    }

    [Theory]
    [InlineData("Cancelled")]
    [InlineData("Rejected")]
    public async Task Cancelled_or_rejected_booking_releases_capacity(string status)
    {
        var scenario = await app.SeedAsync(vehicleCount: 11);
        var first = await CreateAsync(scenario);
        for (var index = 1; index < 10; index++)
            await CreateAsync(scenario, vehicleIndex: index);

        using var update = await app.Client.PutAsJsonAsync($"/api/appointments/{first.Id}", scenario.Update(status));
        await AssertStatusAsync(update, HttpStatusCode.OK);
        await CreateAsync(scenario, vehicleIndex: 10);
        Assert.Equal(11, await app.CountBookingsAsync(scenario.CustomerId));
    }

    [Fact]
    public async Task Catalogue_change_and_confirmation_preserve_original_snapshot()
    {
        var scenario = await app.SeedAsync();
        var booking = await CreateAsync(scenario);
        using var catalogue = await app.Client.PutAsJsonAsync($"/api/services/{scenario.ServiceId}", new
        {
            Name = "Oil change plus", CurrentPrice = 250m, EstimatedDurationMinutes = 120, IsActive = false
        });
        await AssertStatusAsync(catalogue, HttpStatusCode.OK);
        using var confirmation = await app.Client.PutAsJsonAsync($"/api/appointments/{booking.Id}",
            scenario.Update("Confirmed"));
        await AssertStatusAsync(confirmation, HttpStatusCode.OK);

        var saved = await app.Client.GetFromJsonAsync<AppointmentDetails>($"/api/appointments/{booking.Id}");
        Assert.NotNull(saved);
        Assert.Equal("Confirmed", saved.Status);
        Assert.Equal(scenario.StartUtc.AddHours(1), saved.EstimatedEndUtc);
        var snapshot = Assert.Single(saved.Services);
        Assert.Equal(scenario.ServiceName, snapshot.Name);
        Assert.Equal(120.50m, snapshot.Price);
        Assert.Equal(60, snapshot.DurationMinutes);
    }

    [Fact]
    public async Task Invalid_status_transition_returns_conflict_and_preserves_booking()
    {
        var scenario = await app.SeedAsync();
        var booking = await CreateAsync(scenario);
        using var response = await app.Client.PutAsJsonAsync($"/api/appointments/{booking.Id}",
            scenario.Update("Completed"));
        await AssertConflictAsync(response, "cannot change");

        var saved = await app.Client.GetFromJsonAsync<AppointmentDetails>($"/api/appointments/{booking.Id}");
        Assert.NotNull(saved);
        Assert.Equal("Requested", saved.Status);
        Assert.Equal(scenario.StartUtc, saved.ScheduledAtUtc);
    }

    [Fact]
    public async Task Rescheduling_into_an_overlap_preserves_original_time()
    {
        var scenario = await app.SeedAsync();
        await CreateAsync(scenario);
        var later = await CreateAsync(scenario, startUtc: scenario.StartUtc.AddHours(2));
        using var response = await app.Client.PutAsJsonAsync($"/api/appointments/{later.Id}",
            scenario.Update("Requested", scenario.StartUtc.AddMinutes(30)));
        await AssertConflictAsync(response, "overlapping");

        var saved = await app.Client.GetFromJsonAsync<AppointmentDetails>($"/api/appointments/{later.Id}");
        Assert.NotNull(saved);
        Assert.Equal(scenario.StartUtc.AddHours(2), saved.ScheduledAtUtc);
        Assert.Equal(2, await app.CountBookingsAsync(scenario.CustomerId));
    }

    private async Task<AppointmentDetails> CreateAsync(BookingScenario scenario,
        int vehicleIndex = 0, DateTime? startUtc = null)
    {
        using var response = await app.Client.PostAsJsonAsync("/api/appointments", scenario.Request(vehicleIndex, startUtc));
        await AssertStatusAsync(response, HttpStatusCode.Created);
        var booking = await response.Content.ReadFromJsonAsync<AppointmentDetails>();
        Assert.NotNull(booking);
        Assert.Equal($"/api/Appointments/{booking.Id}", response.Headers.Location?.AbsolutePath,
            ignoreCase: true);
        return booking;
    }

    private static async Task AssertValidationAsync(HttpResponseMessage response, string field)
    {
        await AssertStatusAsync(response, HttpStatusCode.BadRequest);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(json.RootElement.GetProperty("errors").TryGetProperty(field, out var errors));
        Assert.True(errors.GetArrayLength() > 0);
    }

    private static async Task AssertConflictAsync(HttpResponseMessage response, string detail)
    {
        await AssertStatusAsync(response, HttpStatusCode.Conflict);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(409, json.RootElement.GetProperty("status").GetInt32());
        Assert.Contains(detail, json.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertStatusAsync(HttpResponseMessage response, HttpStatusCode expected) =>
        Assert.True(response.StatusCode == expected,
            $"Expected {(int)expected}, received {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
}
