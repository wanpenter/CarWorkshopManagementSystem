using System.Net;
using System.Net.Http.Json;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CarWorkshop.IntegrationTests;

public sealed class MechanicAssignmentApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Assignment_is_persisted_and_returned_by_get_and_list()
    {
        var scenario = await app.SeedAsync();
        var booking = await BookingAsync(scenario);
        var mechanic = await MechanicAsync();
        await UpdateAsync(scenario, booking, "Confirmed");

        using var response = await AssignAsync(booking.Id, mechanic.Id);
        await ExpectAsync(response, HttpStatusCode.OK);
        var assigned = await response.Content.ReadFromJsonAsync<AppointmentDetails>();
        Assert.Equal(mechanic.Id, assigned!.MechanicId);
        Assert.Equal(mechanic.FullName, assigned.MechanicName);

        var saved = await GetAsync(booking.Id);
        Assert.Equal(mechanic.Id, saved.MechanicId);
        Assert.Equal(mechanic.FullName, saved.MechanicName);
        var list = await app.Client.GetFromJsonAsync<AppointmentDetails[]>(
            $"/api/appointments?customerId={scenario.CustomerId}");
        Assert.Equal(mechanic.Id, Assert.Single(list!).MechanicId);
        Assert.Equal(mechanic.FullName, Assert.Single(list!).MechanicName);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CarWorkshopDbContext>();
        Assert.Equal(mechanic.Id, await db.Appointments.Where(item => item.Id == booking.Id)
            .Select(item => item.MechanicId).SingleAsync());
    }

    [Fact]
    public async Task Inactive_mechanic_is_rejected_without_saving()
    {
        var scenario = await app.SeedAsync();
        var booking = await BookingAsync(scenario);
        await UpdateAsync(scenario, booking, "Confirmed");
        var mechanic = await MechanicAsync(active: false);
        using var response = await AssignAsync(booking.Id, mechanic.Id);
        await ExpectAsync(response, HttpStatusCode.Conflict);
        Assert.Contains("Inactive", await response.Content.ReadAsStringAsync());
        Assert.Null((await GetAsync(booking.Id)).MechanicId);
    }

    [Theory]
    [InlineData("Requested")]
    [InlineData("Cancelled")]
    [InlineData("Rejected")]
    [InlineData("InProgress")]
    [InlineData("Completed")]
    public async Task Unsupported_status_cannot_receive_assignment(string status)
    {
        var scenario = await app.SeedAsync();
        var booking = await BookingAsync(scenario);
        if (status is "InProgress" or "Completed")
        {
            await UpdateAsync(scenario, booking, "Confirmed");
            await UpdateAsync(scenario, booking, "InProgress");
        }
        if (status is not ("Requested" or "InProgress"))
            await UpdateAsync(scenario, booking, status);

        var mechanic = await MechanicAsync();
        using var response = await AssignAsync(booking.Id, mechanic.Id);
        await ExpectAsync(response, HttpStatusCode.Conflict);
        Assert.Null((await GetAsync(booking.Id)).MechanicId);
    }

    [Theory]
    [InlineData(0, HttpStatusCode.BadRequest)]
    [InlineData(-1, HttpStatusCode.BadRequest)]
    [InlineData(int.MaxValue, HttpStatusCode.NotFound)]
    public async Task Invalid_or_missing_mechanic_is_rejected(int mechanicId, HttpStatusCode expected)
    {
        var scenario = await app.SeedAsync();
        var booking = await BookingAsync(scenario);
        await UpdateAsync(scenario, booking, "Confirmed");
        using var response = await AssignAsync(booking.Id, mechanicId);
        await ExpectAsync(response, expected);
        Assert.Null((await GetAsync(booking.Id)).MechanicId);
    }

    [Fact]
    public async Task Missing_appointment_returns_not_found()
    {
        var mechanic = await MechanicAsync();
        using var response = await AssignAsync(int.MaxValue, mechanic.Id);
        await ExpectAsync(response, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Overlap_is_rejected_but_adjacent_job_and_different_mechanic_are_allowed()
    {
        var scenario = await app.SeedAsync(vehicleCount: 3);
        var first = await BookingAsync(scenario);
        var overlapping = await BookingAsync(scenario, 1, scenario.StartUtc.AddMinutes(30));
        var adjacent = await BookingAsync(scenario, 2, scenario.StartUtc.AddHours(1));
        foreach (var booking in new[] { first, overlapping, adjacent })
            await UpdateAsync(scenario, booking, "Confirmed");
        var mechanic = await MechanicAsync();
        using var initial = await AssignAsync(first.Id, mechanic.Id);
        await ExpectAsync(initial, HttpStatusCode.OK);
        using var conflict = await AssignAsync(overlapping.Id, mechanic.Id);
        await ExpectAsync(conflict, HttpStatusCode.Conflict);
        Assert.Null((await GetAsync(overlapping.Id)).MechanicId);
        using var boundary = await AssignAsync(adjacent.Id, mechanic.Id);
        await ExpectAsync(boundary, HttpStatusCode.OK);
        var another = await MechanicAsync();
        using var different = await AssignAsync(overlapping.Id, another.Id);
        await ExpectAsync(different, HttpStatusCode.OK);
    }

    [Fact]
    public async Task Reschedule_and_duration_change_cannot_overlap_and_preserve_saved_assignment()
    {
        var scenario = await app.SeedAsync(vehicleCount: 2);
        var first = await BookingAsync(scenario);
        var later = await BookingAsync(scenario, 1, scenario.StartUtc.AddHours(2));
        var mechanic = await MechanicAsync();
        foreach (var booking in new[] { first, later })
        {
            await UpdateAsync(scenario, booking, "Confirmed");
            using var assigned = await AssignAsync(booking.Id, mechanic.Id);
            await ExpectAsync(assigned, HttpStatusCode.OK);
        }

        using var moved = await PutBookingAsync(scenario, later, "Confirmed", scenario.StartUtc.AddMinutes(30));
        await ExpectAsync(moved, HttpStatusCode.Conflict);
        var saved = await GetAsync(later.Id);
        Assert.Equal(later.ScheduledAtUtc, saved.ScheduledAtUtc);
        Assert.Equal(mechanic.Id, saved.MechanicId);

        using var serviceResponse = await app.Client.PostAsJsonAsync("/api/services", new
        {
            Name = $"Long inspection {Guid.NewGuid():N}", CurrentPrice = 100,
            EstimatedDurationMinutes = 180, IsActive = true
        });
        await ExpectAsync(serviceResponse, HttpStatusCode.Created);
        var longerService = await serviceResponse.Content.ReadFromJsonAsync<ServiceDetails>();
        using var extended = await PutBookingAsync(scenario, first, "Confirmed", serviceId: longerService!.Id);
        await ExpectAsync(extended, HttpStatusCode.Conflict);
        Assert.Equal(first.EstimatedEndUtc, (await GetAsync(first.Id)).EstimatedEndUtc);
    }

    [Fact]
    public async Task Reassignment_ignores_own_booking_and_failed_reassignment_keeps_original_mechanic()
    {
        var scenario = await app.SeedAsync(vehicleCount: 2);
        var first = await BookingAsync(scenario);
        var second = await BookingAsync(scenario, 1);
        var abu = await MechanicAsync();
        var ali = await MechanicAsync();
        await UpdateAsync(scenario, first, "Confirmed");
        await UpdateAsync(scenario, second, "Confirmed");
        using var assignFirst = await AssignAsync(first.Id, abu.Id);
        using var assignSecond = await AssignAsync(second.Id, ali.Id);
        await ExpectAsync(assignFirst, HttpStatusCode.OK);
        await ExpectAsync(assignSecond, HttpStatusCode.OK);
        using var repeat = await AssignAsync(first.Id, abu.Id);
        await ExpectAsync(repeat, HttpStatusCode.OK);
        using var conflict = await AssignAsync(first.Id, ali.Id);
        await ExpectAsync(conflict, HttpStatusCode.Conflict);
        Assert.Equal(abu.Id, (await GetAsync(first.Id)).MechanicId);

        await UpdateAsync(scenario, second, "Cancelled");
        using var released = await AssignAsync(first.Id, ali.Id);
        await ExpectAsync(released, HttpStatusCode.OK);
        Assert.Equal(ali.Id, (await GetAsync(first.Id)).MechanicId);
    }

    [Fact]
    public async Task Concurrent_assignments_only_assign_one_overlapping_job()
    {
        var scenario = await app.SeedAsync(vehicleCount: 2);
        var first = await BookingAsync(scenario);
        var second = await BookingAsync(scenario, 1);
        var mechanic = await MechanicAsync();
        await UpdateAsync(scenario, first, "Confirmed");
        await UpdateAsync(scenario, second, "Confirmed");
        var responses = await Task.WhenAll(AssignAsync(first.Id, mechanic.Id), AssignAsync(second.Id, mechanic.Id));
        try
        {
            Assert.Single(responses, item => item.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, item => item.StatusCode == HttpStatusCode.Conflict);
            var saved = new[] { await GetAsync(first.Id), await GetAsync(second.Id) };
            Assert.Single(saved, item => item.MechanicId == mechanic.Id);
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [Fact]
    public async Task Concurrent_reschedule_and_assignment_cannot_create_overlap()
    {
        var scenario = await app.SeedAsync(vehicleCount: 2);
        var first = await BookingAsync(scenario);
        var later = await BookingAsync(scenario, 1, scenario.StartUtc.AddHours(2));
        var mechanic = await MechanicAsync();
        await UpdateAsync(scenario, first, "Confirmed");
        await UpdateAsync(scenario, later, "Confirmed");
        using var initial = await AssignAsync(first.Id, mechanic.Id);
        await ExpectAsync(initial, HttpStatusCode.OK);

        var responses = await Task.WhenAll(
            PutBookingAsync(scenario, first, "Confirmed", later.ScheduledAtUtc),
            AssignAsync(later.Id, mechanic.Id));
        try
        {
            Assert.Single(responses, item => item.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, item => item.StatusCode == HttpStatusCode.Conflict);
            var savedFirst = await GetAsync(first.Id);
            var savedLater = await GetAsync(later.Id);
            Assert.False(savedFirst.MechanicId == savedLater.MechanicId &&
                savedFirst.ScheduledAtUtc < savedLater.EstimatedEndUtc &&
                savedLater.ScheduledAtUtc < savedFirst.EstimatedEndUtc);
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    private async Task<MechanicDetails> MechanicAsync(bool active = true)
    {
        using var response = await app.Client.PostAsJsonAsync("/api/mechanics", new
        {
            FullName = "Test mechanic", Phone = "0198765432", IsActive = active
        });
        await ExpectAsync(response, HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<MechanicDetails>())!;
    }

    private async Task<AppointmentDetails> BookingAsync(BookingScenario scenario, int vehicleIndex = 0,
        DateTime? start = null)
    {
        using var response = await app.Client.PostAsJsonAsync("/api/appointments", scenario.Request(vehicleIndex, start));
        await ExpectAsync(response, HttpStatusCode.Created);
        var booking = (await response.Content.ReadFromJsonAsync<AppointmentDetails>())!;
        Assert.Null(booking.MechanicId);
        return booking;
    }

    private async Task UpdateAsync(BookingScenario scenario, AppointmentDetails booking, string status)
    {
        using var response = await PutBookingAsync(scenario, booking, status);
        await ExpectAsync(response, HttpStatusCode.OK);
    }

    private Task<HttpResponseMessage> PutBookingAsync(BookingScenario scenario, AppointmentDetails booking,
        string status, DateTime? start = null, int? serviceId = null) =>
        app.Client.PutAsJsonAsync($"/api/appointments/{booking.Id}", new
        {
            booking.CustomerId, booking.VehicleId, ScheduledAtUtc = start ?? booking.ScheduledAtUtc,
            ServiceIds = new[] { serviceId ?? scenario.ServiceId }, Status = status
        });

    private Task<HttpResponseMessage> AssignAsync(int bookingId, int mechanicId) =>
        app.Client.PutAsJsonAsync($"/api/appointments/{bookingId}/mechanic", new { MechanicId = mechanicId });

    private async Task<AppointmentDetails> GetAsync(int id) =>
        (await app.Client.GetFromJsonAsync<AppointmentDetails>($"/api/appointments/{id}"))!;

    private static async Task ExpectAsync(HttpResponseMessage response, HttpStatusCode expected) =>
        Assert.True(response.StatusCode == expected,
            $"Expected {(int)expected}, received {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
}
