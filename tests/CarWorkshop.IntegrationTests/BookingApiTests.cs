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

    [Fact]
    public async Task Staff_can_record_service_once_after_completion_and_read_it_back()
    {
        var scenario = await app.SeedAsync(vehicleCount: 2);
        var booking = await CreateAsync(scenario);
        var unrelated = await CreateAsync(scenario, vehicleIndex: 1);
        var account = await app.CreateAccountAsync();
        using var staff = await app.LoginAsync(account.Username, account.Password);
        var appointmentUrl = $"/api/appointments/{booking.Id}";
        var recordUrl = $"{appointmentUrl}/service-record";
        var extra = await app.SeedAsync();
        var serviceRecord = new { mileage = 82450, serviceIds = new[] { scenario.ServiceId, extra.ServiceId } };

        using var anonymous = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(anonymous);
        using var unauthorized = await anonymous.PostAsJsonAsync(recordUrl, serviceRecord);
        await AssertStatusAsync(unauthorized, HttpStatusCode.Unauthorized);

        using var early = await staff.PostAsJsonAsync(recordUrl, serviceRecord);
        await AssertConflictAsync(early, "Complete the appointment");
        foreach (var status in new[] { "Confirmed", "InProgress", "Completed" })
        {
            using var updated = await staff.PutAsJsonAsync(appointmentUrl, scenario.Update(status));
            await AssertStatusAsync(updated, HttpStatusCode.OK);
        }

        using var invalid = await staff.PostAsJsonAsync(recordUrl, new { mileage = -1, serviceRecord.serviceIds });
        await AssertValidationAsync(invalid, "mileage");
        using var blank = await staff.PostAsJsonAsync(recordUrl, new { serviceRecord.mileage, workPerformed = " " });
        await AssertValidationAsync(blank, "serviceIds");
        using var unknown = await staff.PostAsJsonAsync(recordUrl, new { serviceRecord.mileage, serviceIds = new[] { int.MaxValue } });
        await AssertValidationAsync(unknown, "serviceIds");
        using var rename = await app.Client.PutAsJsonAsync($"/api/services/{scenario.ServiceId}", new
        {
            Name = "Renamed after booking", CurrentPrice = 120.50m, EstimatedDurationMinutes = 60, IsActive = false
        });
        await AssertStatusAsync(rename, HttpStatusCode.OK);

        var submissions = await Task.WhenAll(staff.PostAsJsonAsync(recordUrl, serviceRecord),
            staff.PostAsJsonAsync(recordUrl, serviceRecord));
        try
        {
            Assert.Single(submissions, response => response.StatusCode == HttpStatusCode.OK);
            await AssertConflictAsync(Assert.Single(submissions, response => response.StatusCode == HttpStatusCode.Conflict),
                "already has a service record");
        }
        finally
        {
            foreach (var submission in submissions) submission.Dispose();
        }

        using var duplicate = await staff.PostAsJsonAsync(recordUrl, new { mileage = 999, workPerformed = "Overwrite attempt" });
        await AssertConflictAsync(duplicate, "already has a service record");

        var results = await staff.GetFromJsonAsync<AppointmentDetails[]>("/api/appointments");
        Assert.NotNull(results);
        var saved = Assert.Single(results, result => result.Id == booking.Id);
        Assert.Equal(scenario.VehicleIds[0], saved.VehicleId);
        Assert.NotNull(saved.ServiceRecord);
        Assert.Equal(82450, saved.ServiceRecord.Mileage);
        Assert.Equal($"{scenario.ServiceName}\n{extra.ServiceName}", saved.ServiceRecord.WorkPerformed);
        Assert.Equal(DateTimeKind.Utc, saved.ServiceRecord.RecordedAtUtc.Kind);
        Assert.Null(Assert.Single(results, result => result.Id == unrelated.Id).ServiceRecord);
    }

    [Fact]
    public async Task Status_transition_endpoint_enforces_workflow_persists_reason_and_logs_receipt_printing()
    {
        var scenario = await app.SeedAsync(vehicleCount: 2);
        var booking = await CreateAsync(scenario);
        var cancelledBooking = await CreateAsync(scenario, vehicleIndex: 1, startUtc: scenario.StartUtc.AddHours(2));

        // Invalid jump directly to Completed returns 409.
        using var invalidJump = await app.Client.PostAsJsonAsync(
            $"/api/appointments/{booking.Id}/status",
            new { status = "Completed" });
        await AssertConflictAsync(invalidJump, "cannot change");

        // Receipt printing before completion is rejected with 409.
        using var earlyReceipt = await app.Client.PostAsync(
            $"/api/appointments/{booking.Id}/receipt-printed",
            content: null);
        await AssertConflictAsync(earlyReceipt, "completed");

        // Valid step-by-step workflow progression.
        foreach (var nextStatus in new[] { "Confirmed", "InProgress", "Completed" })
        {
            using var step = await app.Client.PostAsJsonAsync(
                $"/api/appointments/{booking.Id}/status",
                new { status = nextStatus });
            await AssertStatusAsync(step, HttpStatusCode.OK);
            var updated = await step.Content.ReadFromJsonAsync<AppointmentDetails>();
            Assert.NotNull(updated);
            Assert.Equal(nextStatus, updated.Status);
        }

        // Receipt printing after completion returns 204 and records AuditLog.
        using var printReceipt = await app.Client.PostAsync(
            $"/api/appointments/{booking.Id}/receipt-printed",
            content: null);
        await AssertStatusAsync(printReceipt, HttpStatusCode.NoContent);

        // Cancellation persists trimmed reason and records it in AuditLog.
        using var cancelResponse = await app.Client.PostAsJsonAsync(
            $"/api/appointments/{cancelledBooking.Id}/status",
            new { status = "Cancelled", reason = "  Customer postponed visit  " });
        await AssertStatusAsync(cancelResponse, HttpStatusCode.OK);
        var cancelled = await cancelResponse.Content.ReadFromJsonAsync<AppointmentDetails>();
        Assert.NotNull(cancelled);
        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Equal("Customer postponed visit", cancelled.StatusReason);

        using var logsResponse = await app.Client.GetAsync(
            $"/api/audit-logs?entityType=Appointment&search={booking.Id}&page=1&pageSize=20");
        await AssertStatusAsync(logsResponse, HttpStatusCode.OK);
        using var logsDoc = JsonDocument.Parse(await logsResponse.Content.ReadAsStringAsync());
        Assert.Contains(logsDoc.RootElement.GetProperty("items").EnumerateArray(), item =>
            item.GetProperty("entityId").GetInt32() == booking.Id &&
            item.GetProperty("action").GetString() == "Appointment.ReceiptPrinted");

        using var cancelLogsResponse = await app.Client.GetAsync(
            $"/api/audit-logs?entityType=Appointment&search={cancelledBooking.Id}&page=1&pageSize=20");
        await AssertStatusAsync(cancelLogsResponse, HttpStatusCode.OK);
        using var cancelLogsDoc = JsonDocument.Parse(await cancelLogsResponse.Content.ReadAsStringAsync());
        Assert.Contains(cancelLogsDoc.RootElement.GetProperty("items").EnumerateArray(), item =>
            item.GetProperty("entityId").GetInt32() == cancelledBooking.Id &&
            item.GetProperty("action").GetString() == "Appointment.StatusChanged" &&
            item.GetProperty("summary").GetString()!.Contains("Customer postponed visit"));
    }

    [Fact]
    public async Task Recording_service_persists_next_service_mileage_and_only_advances_vehicle_odometer()
    {
        var scenario = await app.SeedAsync();
        var latest = await CreateAsync(scenario, startUtc: scenario.StartUtc);
        var backfill = await CreateAsync(scenario, startUtc: scenario.StartUtc.AddHours(2));

        foreach (var bookingId in new[] { latest.Id, backfill.Id })
        {
            foreach (var status in new[] { "Confirmed", "InProgress", "Completed" })
            {
                using var step = await app.Client.PostAsJsonAsync(
                    $"/api/appointments/{bookingId}/status",
                    new { status });
                await AssertStatusAsync(step, HttpStatusCode.OK);
            }
        }

        // Next service mileage <= current mileage is rejected with 400.
        using var invalidNext = await app.Client.PostAsJsonAsync(
            $"/api/appointments/{latest.Id}/service-record",
            new { mileage = 75000, nextServiceMileage = 75000, serviceIds = new[] { scenario.ServiceId } });
        await AssertValidationAsync(invalidNext, "nextServiceMileage");

        // Higher odometer advances Vehicle.Mileage from 1000 to 75000 and persists nextServiceMileage.
        using var savedLatest = await app.Client.PostAsJsonAsync(
            $"/api/appointments/{latest.Id}/service-record",
            new { mileage = 75000, nextServiceMileage = 85000, serviceIds = new[] { scenario.ServiceId } });
        await AssertStatusAsync(savedLatest, HttpStatusCode.OK);
        var latestDetails = await savedLatest.Content.ReadFromJsonAsync<AppointmentDetails>();
        Assert.Equal(85000, latestDetails!.ServiceRecord!.NextServiceMileage);

        var vehicleAfterLatest = await app.Client.GetFromJsonAsync<VehicleDetails>($"/api/vehicles/{scenario.VehicleIds[0]}");
        Assert.Equal(75000, vehicleAfterLatest!.Mileage);

        // Recording a lower historical reading must NOT roll back Vehicle.Mileage.
        using var savedBackfill = await app.Client.PostAsJsonAsync(
            $"/api/appointments/{backfill.Id}/service-record",
            new { mileage = 62000, nextServiceMileage = 72000, serviceIds = new[] { scenario.ServiceId } });
        await AssertStatusAsync(savedBackfill, HttpStatusCode.OK);

        var vehicleAfterBackfill = await app.Client.GetFromJsonAsync<VehicleDetails>($"/api/vehicles/{scenario.VehicleIds[0]}");
        Assert.Equal(75000, vehicleAfterBackfill!.Mileage);
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
