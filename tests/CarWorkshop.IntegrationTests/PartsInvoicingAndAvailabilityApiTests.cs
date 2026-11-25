using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CarWorkshop.IntegrationTests;

public sealed class PartsInvoicingAndAvailabilityApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Health_and_readiness_endpoints_return_security_and_request_id_headers()
    {
        using var client = app.CreateAnonymousClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health/ready");
        request.Headers.Add("X-Request-Id", "probe-req-123");

        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("probe-req-123", response.Headers.GetValues("X-Request-Id").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("strict-origin-when-cross-origin", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.True(response.Headers.Contains("Permissions-Policy"));

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ready", body.RootElement.GetProperty("status").GetString());
        Assert.Equal("reachable", body.RootElement.GetProperty("database").GetString());
    }

    [Fact]
    public async Task Availability_api_returns_18_slots_flags_hours_and_vehicle_conflicts_and_blocks_idor()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var scenario = await app.SeedAsync(activeService: true);
        var vehicleId = scenario.VehicleIds[0];
        var bookedStartUtc = scenario.StartUtc.AddDays(95);
        var malaysiaDate = bookedStartUtc.AddHours(8).ToString("yyyy-MM-dd");

        // Book a 60-minute slot at 09:00 MYT (01:00 UTC) for scenario vehicle
        using var createBooking = await app.Client.PostAsJsonAsync("/api/appointments", new
        {
            customerId = scenario.CustomerId,
            vehicleId,
            scheduledAtUtc = bookedStartUtc,
            serviceIds = new[] { scenario.ServiceId }
        });
        Assert.Equal(HttpStatusCode.Created, createBooking.StatusCode);

        using var availResp = await app.Client.GetAsync(
            $"/api/appointments/availability?date={malaysiaDate}&durationMinutes=60&vehicleId={vehicleId}");
        Assert.Equal(HttpStatusCode.OK, availResp.StatusCode);
        using var availJson = JsonDocument.Parse(await availResp.Content.ReadAsStringAsync());
        var slots = availJson.RootElement.GetProperty("slots").EnumerateArray().ToArray();
        Assert.Equal(18, slots.Length);
        Assert.Equal(1, availJson.RootElement.GetProperty("dailyBookedCount").GetInt32());

        var nineAm = slots.Single(s => s.GetProperty("startLocal").GetString() == "09:00");
        Assert.False(nineAm.GetProperty("available").GetBoolean());
        Assert.Equal("vehicle_conflict", nineAm.GetProperty("unavailableReason").GetString());

        // 17:00 start with 60 min finishes at 18:00 > 17:30 closing -> exceeds_hours
        var fivePm = slots.Single(s => s.GetProperty("startLocal").GetString() == "17:00");
        Assert.False(fivePm.GetProperty("available").GetBoolean());
        Assert.Equal("exceeds_hours", fivePm.GetProperty("unavailableReason").GetString());

        // 10:00 start is after 09:00-10:00 booking -> available
        var tenAm = slots.Single(s => s.GetProperty("startLocal").GetString() == "10:00");
        Assert.True(tenAm.GetProperty("available").GetBoolean());
        Assert.True(tenAm.GetProperty("remainingMechanics").GetInt32() >= 1);

        // Customer cannot query availability using another customer's vehicleId (403 Forbidden)
        using var customerClient = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(customerClient);
        using var regResp = await customerClient.PostAsJsonAsync("/api/auth/register", new
        {
            username = $"avail.{suffix}",
            fullName = "Avail Customer",
            phone = "0126661111",
            password = "Customer!Pass#2039"
        });
        Assert.Equal(HttpStatusCode.Created, regResp.StatusCode);

        using var idorResp = await customerClient.GetAsync(
            $"/api/portal/availability?date={malaysiaDate}&durationMinutes=60&vehicleId={vehicleId}");
        Assert.Equal(HttpStatusCode.Forbidden, idorResp.StatusCode);

        // Without another customer's vehicleId, customer gets 200 OK
        using var customerOk = await customerClient.GetAsync(
            $"/api/portal/availability?date={malaysiaDate}&durationMinutes=60");
        Assert.Equal(HttpStatusCode.OK, customerOk.StatusCode);
    }

    [Fact]
    public async Task Parts_inventory_usage_auto_invoice_and_payment_workflow_end_to_end()
    {
        var suffix = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var scenario = await app.SeedAsync(activeService: true);
        var vehicleId = scenario.VehicleIds[0];
        var sku = $"SKU-{suffix}";

        // 1. Create part and reject duplicate SKU
        using var createPart = await app.Client.PostAsJsonAsync("/api/parts", new
        {
            sku = sku.ToLowerInvariant(),
            name = "Engine Oil 5W-40",
            description = "Fully synthetic 4L",
            unitPrice = 160m,
            stockQuantity = 5,
            lowStockThreshold = 2,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, createPart.StatusCode);
        using var partJson = JsonDocument.Parse(await createPart.Content.ReadAsStringAsync());
        var partId = partJson.RootElement.GetProperty("id").GetInt32();
        Assert.Equal(sku, partJson.RootElement.GetProperty("sku").GetString());

        using var duplicatePart = await app.Client.PostAsJsonAsync("/api/parts", new
        {
            sku,
            name = "Duplicate",
            unitPrice = 10m,
            stockQuantity = 1,
            lowStockThreshold = 1,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicatePart.StatusCode);

        // 2. Adjust stock (+2 -> 7, -20 -> 409)
        using var restock = await app.Client.PostAsJsonAsync($"/api/parts/{partId}/adjust-stock", new
        {
            delta = 2,
            reason = "Supplier restock"
        });
        Assert.Equal(HttpStatusCode.OK, restock.StatusCode);
        using var restockJson = JsonDocument.Parse(await restock.Content.ReadAsStringAsync());
        Assert.Equal(7, restockJson.RootElement.GetProperty("stockQuantity").GetInt32());

        using var badAdjust = await app.Client.PostAsJsonAsync($"/api/parts/{partId}/adjust-stock", new
        {
            delta = -20,
            reason = "Too much"
        });
        Assert.Equal(HttpStatusCode.Conflict, badAdjust.StatusCode);

        // 3. Create booking -> Confirm -> Assign -> Start InProgress
        using var bookingResp = await app.Client.PostAsJsonAsync("/api/appointments", new
        {
            customerId = scenario.CustomerId,
            vehicleId,
            scheduledAtUtc = scenario.StartUtc.AddDays(110),
            serviceIds = new[] { scenario.ServiceId }
        });
        Assert.Equal(HttpStatusCode.Created, bookingResp.StatusCode);
        var appointmentId = JsonDocument.Parse(await bookingResp.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.OK, (await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/status", new { status = "Confirmed" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await app.Client.PutAsJsonAsync($"/api/appointments/{appointmentId}/mechanic", new { mechanicId = app.DefaultMechanicId })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/status", new { status = "InProgress" })).StatusCode);

        // 4. Add 2 parts (stock 7 -> 5), then remove and re-add 1 (stock -> 6)
        using var addPart1 = await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/parts", new
        {
            partId,
            quantity = 2
        });
        Assert.Equal(HttpStatusCode.OK, addPart1.StatusCode);
        using var withPart1 = JsonDocument.Parse(await addPart1.Content.ReadAsStringAsync());
        var partLineId = withPart1.RootElement.GetProperty("partsUsed")[0].GetProperty("id").GetInt32();

        using var removePart = await app.Client.DeleteAsync($"/api/appointments/{appointmentId}/parts/{partLineId}");
        Assert.Equal(HttpStatusCode.OK, removePart.StatusCode);

        using var addPartFinal = await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/parts", new
        {
            partId,
            quantity = 1
        });
        Assert.Equal(HttpStatusCode.OK, addPartFinal.StatusCode);

        using var partAfter = await app.Client.GetAsync($"/api/parts/{partId}");
        Assert.Equal(6, JsonDocument.Parse(await partAfter.Content.ReadAsStringAsync()).RootElement.GetProperty("stockQuantity").GetInt32());

        // 5. Complete -> Invoice auto-issued (Labour 120.50 + Parts 160 = 280.50)
        using var completeResp = await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/status", new { status = "Completed" });
        Assert.Equal(HttpStatusCode.OK, completeResp.StatusCode);
        using var completedJson = JsonDocument.Parse(await completeResp.Content.ReadAsStringAsync());
        var invoice = completedJson.RootElement.GetProperty("invoice");
        Assert.Equal(120.50m, invoice.GetProperty("labourSubtotal").GetDecimal());
        Assert.Equal(160m, invoice.GetProperty("partsSubtotal").GetDecimal());
        Assert.Equal(280.50m, invoice.GetProperty("totalAmount").GetDecimal());
        Assert.Equal("Unpaid", invoice.GetProperty("paymentStatus").GetString());

        // 6. Partial payment RM 100 via DuitNowQR -> PartiallyPaid -> blocks further part additions (409)
        using var pay1 = await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/payment", new
        {
            amount = 100m,
            method = "DuitNowQR",
            reference = "QR-9921"
        });
        Assert.Equal(HttpStatusCode.OK, pay1.StatusCode);
        using var pay1Json = JsonDocument.Parse(await pay1.Content.ReadAsStringAsync());
        Assert.Equal("PartiallyPaid", pay1Json.RootElement.GetProperty("invoice").GetProperty("paymentStatus").GetString());
        Assert.Equal(180.50m, pay1Json.RootElement.GetProperty("invoice").GetProperty("balanceDue").GetDecimal());

        using var lockedPartAdd = await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/parts", new
        {
            partId,
            quantity = 1
        });
        Assert.Equal(HttpStatusCode.Conflict, lockedPartAdd.StatusCode);

        // 7. Final payment RM 180.50 via Cash -> Paid
        using var pay2 = await app.Client.PostAsJsonAsync($"/api/appointments/{appointmentId}/payment", new
        {
            amount = 180.50m,
            method = "Cash"
        });
        Assert.Equal(HttpStatusCode.OK, pay2.StatusCode);
        using var pay2Json = JsonDocument.Parse(await pay2.Content.ReadAsStringAsync());
        Assert.Equal("Paid", pay2Json.RootElement.GetProperty("invoice").GetProperty("paymentStatus").GetString());
        Assert.Equal(0m, pay2Json.RootElement.GetProperty("invoice").GetProperty("balanceDue").GetDecimal());
    }
}
