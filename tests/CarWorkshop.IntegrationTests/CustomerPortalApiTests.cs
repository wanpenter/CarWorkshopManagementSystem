using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CarWorkshop.IntegrationTests;

public sealed class CustomerPortalApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Anonymous_requests_to_customer_portal_return_401()
    {
        using var client = app.CreateAnonymousClient();
        foreach (var path in new[]
                 {
                     "/api/portal/profile",
                     "/api/portal/services",
                     "/api/portal/vehicles",
                     "/api/portal/appointments"
                 })
        {
            using var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public async Task Customer_registration_requires_csrf_creates_session_and_rejects_duplicates()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var username = $"cust.{suffix}";
        const string password = "Customer!Pass#2039";

        using var noCsrfClient = app.CreateAnonymousClient();
        using var missingCsrf = await noCsrfClient.PostAsJsonAsync("/api/auth/register", new
        {
            username,
            fullName = "Aina Customer",
            phone = "012-345 6789",
            address = "Melaka",
            password
        });
        Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);

        using var registered = await RegisterCustomerAsync(username, "Aina Customer", "012-345 6789", password);
        using var meResponse = await registered.Client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, meResponse.StatusCode);
        using var me = JsonDocument.Parse(await meResponse.Content.ReadAsStringAsync());
        Assert.Equal("Customer", me.RootElement.GetProperty("role").GetString());
        Assert.Equal(registered.CustomerId, me.RootElement.GetProperty("customerId").GetInt32());

        using var duplicateClient = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(duplicateClient);
        using var duplicate = await duplicateClient.PostAsJsonAsync("/api/auth/register", new
        {
            username = username.ToUpperInvariant(),
            fullName = "Another Customer",
            phone = "0198887777",
            password
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task Customer_and_staff_policies_are_strictly_isolated_with_403()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var customer = await RegisterCustomerAsync($"rbac.{suffix}", "RBAC Customer", "0124445555", "Customer!Pass#2039");

        foreach (var path in new[]
                 {
                     "/api/customers",
                     "/api/vehicles",
                     "/api/appointments",
                     "/api/services",
                     "/api/mechanics",
                     "/api/cars",
                     "/api/users",
                     "/api/audit-logs"
                 })
        {
            using var denied = await customer.Client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        }

        // Staff/Admin cannot access customer-only portal endpoints either.
        using var adminToPortal = await app.Client.GetAsync("/api/portal/profile");
        Assert.Equal(HttpStatusCode.Forbidden, adminToPortal.StatusCode);

        var staff = await app.CreateAccountAsync(role: "Staff");
        using var staffClient = await app.LoginAsync(staff.Username, staff.Password);
        using var staffToPortal = await staffClient.GetAsync("/api/portal/appointments");
        Assert.Equal(HttpStatusCode.Forbidden, staffToPortal.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_access_or_mutate_another_customers_vehicles_or_bookings()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var scenario = await app.SeedAsync();
        using var customerA = await RegisterCustomerAsync($"idor.a.{suffix}", "Customer A", "0121112222", "Customer!Pass#2039");
        using var customerB = await RegisterCustomerAsync($"idor.b.{suffix}", "Customer B", "0123334444", "Customer!Pass#2039");

        // Customer B creates a vehicle and booking.
        using var vehicleResp = await customerB.Client.PostAsJsonAsync("/api/portal/vehicles", new
        {
            registrationNumber = $"IDB{suffix[..5].ToUpperInvariant()}",
            make = "Honda",
            model = "Civic",
            year = 2022,
            mileage = 25000,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, vehicleResp.StatusCode);
        var bVehicleId = (await vehicleResp.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        using var bookingResp = await customerB.Client.PostAsJsonAsync("/api/portal/appointments", new
        {
            vehicleId = bVehicleId,
            scheduledAtUtc = scenario.StartUtc.AddDays(40),
            serviceIds = new[] { scenario.ServiceId },
            notes = "Customer B booking"
        });
        Assert.Equal(HttpStatusCode.Created, bookingResp.StatusCode);
        var bBookingId = (await bookingResp.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        // Customer A tries every cross-tenant access/mutation -> ALL MUST return 403 Forbidden.
        using var editOtherVehicle = await customerA.Client.PutAsJsonAsync($"/api/portal/vehicles/{bVehicleId}", new
        {
            registrationNumber = $"HACK{suffix[..4].ToUpperInvariant()}",
            make = "Honda",
            model = "Civic",
            year = 2022,
            mileage = 30000,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Forbidden, editOtherVehicle.StatusCode);

        using var deleteOtherVehicle = await customerA.Client.DeleteAsync($"/api/portal/vehicles/{bVehicleId}");
        Assert.Equal(HttpStatusCode.Forbidden, deleteOtherVehicle.StatusCode);

        using var bookWithOtherVehicle = await customerA.Client.PostAsJsonAsync("/api/portal/appointments", new
        {
            vehicleId = bVehicleId,
            scheduledAtUtc = scenario.StartUtc.AddDays(42),
            serviceIds = new[] { scenario.ServiceId }
        });
        Assert.Equal(HttpStatusCode.Forbidden, bookWithOtherVehicle.StatusCode);

        using var viewOtherBooking = await customerA.Client.GetAsync($"/api/portal/appointments/{bBookingId}");
        Assert.Equal(HttpStatusCode.Forbidden, viewOtherBooking.StatusCode);

        using var cancelOtherBooking = await customerA.Client.PostAsJsonAsync($"/api/portal/appointments/{bBookingId}/cancel", new
        {
            reason = "Trying to cancel someone else's booking"
        });
        Assert.Equal(HttpStatusCode.Forbidden, cancelOtherBooking.StatusCode);

        using var printOtherReceipt = await customerA.Client.PostAsync($"/api/portal/appointments/{bBookingId}/receipt-printed", null);
        Assert.Equal(HttpStatusCode.Forbidden, printOtherReceipt.StatusCode);
    }

    [Fact]
    public async Task Customer_end_to_end_self_booking_profile_cancel_guard_and_receipt_workflow()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var activeSeed = await app.SeedAsync(activeService: true);
        var inactiveSeed = await app.SeedAsync(activeService: false);

        using var customer = await RegisterCustomerAsync($"flow.{suffix}", "Farid Customer", "0139998888", "Customer!Pass#2039");

        // 1. Update own profile & verify full name sync.
        using var updateProfile = await customer.Client.PutAsJsonAsync("/api/portal/profile", new
        {
            fullName = "Farid Bin Hassan",
            phone = "0139997777",
            address = "Ayer Keroh, Melaka"
        });
        Assert.Equal(HttpStatusCode.OK, updateProfile.StatusCode);
        using var meAfterProfile = await customer.Client.GetAsync("/api/auth/me");
        using var meJson = JsonDocument.Parse(await meAfterProfile.Content.ReadAsStringAsync());
        Assert.Equal("Farid Bin Hassan", meJson.RootElement.GetProperty("fullName").GetString());

        // 2. Active services list hides inactive services.
        using var servicesResp = await customer.Client.GetAsync("/api/portal/services");
        Assert.Equal(HttpStatusCode.OK, servicesResp.StatusCode);
        using var servicesJson = JsonDocument.Parse(await servicesResp.Content.ReadAsStringAsync());
        var serviceIds = servicesJson.RootElement.EnumerateArray().Select(item => item.GetProperty("id").GetInt32()).ToHashSet();
        Assert.Contains(activeSeed.ServiceId, serviceIds);
        Assert.DoesNotContain(inactiveSeed.ServiceId, serviceIds);

        // 3. Register own vehicle and submit self-booking (starts as Requested).
        using var vehicleResp = await customer.Client.PostAsJsonAsync("/api/portal/vehicles", new
        {
            registrationNumber = $"FLW{suffix[..5].ToUpperInvariant()}",
            make = "Perodua",
            model = "Ativa",
            year = 2023,
            mileage = 18000,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, vehicleResp.StatusCode);
        var vehicleId = (await vehicleResp.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        using var bookResp = await customer.Client.PostAsJsonAsync("/api/portal/appointments", new
        {
            vehicleId,
            scheduledAtUtc = activeSeed.StartUtc.AddDays(60),
            serviceIds = new[] { activeSeed.ServiceId },
            notes = "Self-booked via portal"
        });
        Assert.Equal(HttpStatusCode.Created, bookResp.StatusCode);
        using var bookingJson = JsonDocument.Parse(await bookResp.Content.ReadAsStringAsync());
        var bookingId = bookingJson.RootElement.GetProperty("id").GetInt32();
        Assert.Equal("Requested", bookingJson.RootElement.GetProperty("status").GetString());

        // 4. Staff confirms, assigns a mechanic, and starts work -> Customer can NO LONGER cancel online (409 Conflict).
        using var confirm = await app.Client.PostAsJsonAsync($"/api/appointments/{bookingId}/status", new { status = "Confirmed" });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        using var assign = await app.Client.PutAsJsonAsync($"/api/appointments/{bookingId}/mechanic", new { mechanicId = app.DefaultMechanicId });
        Assert.Equal(HttpStatusCode.OK, assign.StatusCode);
        using var start = await app.Client.PostAsJsonAsync($"/api/appointments/{bookingId}/status", new { status = "InProgress" });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);

        using var lateCancel = await customer.Client.PostAsJsonAsync($"/api/portal/appointments/{bookingId}/cancel", new { reason = "Too late" });
        Assert.Equal(HttpStatusCode.Conflict, lateCancel.StatusCode);

        // 5. Staff completes + records service -> Customer views serviceRecord & prints receipt.
        using var complete = await app.Client.PostAsJsonAsync($"/api/appointments/{bookingId}/status", new { status = "Completed" });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        using var record = await app.Client.PostAsJsonAsync($"/api/appointments/{bookingId}/service-record", new
        {
            mileage = 22500,
            nextServiceMileage = 32500,
            serviceIds = new[] { activeSeed.ServiceId },
            notes = "All checks passed"
        });
        Assert.Equal(HttpStatusCode.OK, record.StatusCode);

        using var detailResp = await customer.Client.GetAsync($"/api/portal/appointments/{bookingId}");
        Assert.Equal(HttpStatusCode.OK, detailResp.StatusCode);
        using var detailJson = JsonDocument.Parse(await detailResp.Content.ReadAsStringAsync());
        Assert.Equal("Completed", detailJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(22500, detailJson.RootElement.GetProperty("serviceRecord").GetProperty("mileage").GetInt32());
        Assert.Equal(32500, detailJson.RootElement.GetProperty("serviceRecord").GetProperty("nextServiceMileage").GetInt32());

        using var printReceipt = await customer.Client.PostAsync($"/api/portal/appointments/{bookingId}/receipt-printed", null);
        Assert.Equal(HttpStatusCode.NoContent, printReceipt.StatusCode);

        // 6. Staff cannot delete a customer that has a linked portal account (409 Conflict).
        using var customerWithoutVehicles = await RegisterCustomerAsync($"del.{suffix}", "Linked Portal Customer", "0127776666", "Customer!Pass#2039");
        using var deleteLinked = await app.Client.DeleteAsync($"/api/customers/{customerWithoutVehicles.CustomerId}");
        Assert.Equal(HttpStatusCode.Conflict, deleteLinked.StatusCode);
    }

    [Fact]
    public async Task Customer_can_cancel_own_pending_booking_with_reason()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var seed = await app.SeedAsync(activeService: true);
        using var customer = await RegisterCustomerAsync($"can.{suffix}", "Cancel Customer", "0145556666", "Customer!Pass#2039");

        using var vehicleResp = await customer.Client.PostAsJsonAsync("/api/portal/vehicles", new
        {
            registrationNumber = $"CAN{suffix[..5].ToUpperInvariant()}",
            make = "Toyota",
            model = "Vios",
            year = 2021,
            mileage = 45000,
            isActive = true
        });
        var vehicleId = (await vehicleResp.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        using var bookResp = await customer.Client.PostAsJsonAsync("/api/portal/appointments", new
        {
            vehicleId,
            scheduledAtUtc = seed.StartUtc.AddDays(70),
            serviceIds = new[] { seed.ServiceId }
        });
        var bookingId = (await bookResp.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        using var cancelResp = await customer.Client.PostAsJsonAsync($"/api/portal/appointments/{bookingId}/cancel", new
        {
            reason = "Outstation trip"
        });
        Assert.Equal(HttpStatusCode.OK, cancelResp.StatusCode);
        using var cancelled = JsonDocument.Parse(await cancelResp.Content.ReadAsStringAsync());
        Assert.Equal("Cancelled", cancelled.RootElement.GetProperty("status").GetString());
        Assert.Equal("Outstation trip", cancelled.RootElement.GetProperty("statusReason").GetString());
    }

    [Fact]
    public async Task Enterprise_portal_login_endpoints_enforce_role_audience_without_enumeration_and_log_audit()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var customerUsername = $"ent.cust.{suffix}";
        const string customerPassword = "Customer!Pass#2039";
        using var customer = await RegisterCustomerAsync(customerUsername, "Enterprise Customer", "0128889999", customerPassword);
        var staff = await app.CreateAccountAsync(role: "Staff");

        // 1. Customer cannot sign in via /api/auth/staff/login (generic 401, no session cookie issued).
        using var customerToStaff = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(customerToStaff);
        using var deniedStaffLogin = await customerToStaff.PostAsJsonAsync("/api/auth/staff/login", new
        {
            username = customerUsername,
            password = customerPassword
        });
        Assert.Equal(HttpStatusCode.Unauthorized, deniedStaffLogin.StatusCode);
        using var customerStaffMe = await customerToStaff.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, customerStaffMe.StatusCode);

        // 2. Customer CAN sign in via /api/auth/customer/login.
        using var customerToCustomer = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(customerToCustomer);
        using var okCustomerLogin = await customerToCustomer.PostAsJsonAsync("/api/auth/customer/login", new
        {
            username = customerUsername,
            password = customerPassword
        });
        Assert.Equal(HttpStatusCode.OK, okCustomerLogin.StatusCode);

        // 3. Staff cannot sign in via /api/auth/customer/login (generic 401, no session, does not lock out account).
        using var staffToCustomer = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(staffToCustomer);
        using var deniedCustomerLogin = await staffToCustomer.PostAsJsonAsync("/api/auth/customer/login", new
        {
            username = staff.Username,
            password = staff.Password
        });
        Assert.Equal(HttpStatusCode.Unauthorized, deniedCustomerLogin.StatusCode);
        using var staffCustomerMe = await staffToCustomer.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, staffCustomerMe.StatusCode);

        // 4. Staff CAN still sign in immediately via /api/auth/staff/login.
        using var staffToStaff = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(staffToStaff);
        using var okStaffLogin = await staffToStaff.PostAsJsonAsync("/api/auth/staff/login", new
        {
            username = staff.Username,
            password = staff.Password
        });
        Assert.Equal(HttpStatusCode.OK, okStaffLogin.StatusCode);

        // 5. Cross-portal login attempts are recorded in Admin Audit Log.
        using var auditResponse = await app.Client.GetAsync($"/api/audit-logs?action=User.PortalAccessDenied&search={Uri.EscapeDataString(customerUsername)}");
        Assert.Equal(HttpStatusCode.OK, auditResponse.StatusCode);
        using var auditJson = JsonDocument.Parse(await auditResponse.Content.ReadAsStringAsync());
        Assert.True(auditJson.RootElement.GetProperty("totalCount").GetInt32() >= 1);
    }

    private async Task<RegisteredCustomerSession> RegisterCustomerAsync(
        string username,
        string fullName,
        string phone,
        string password)
    {
        var client = app.CreateAnonymousClient();
        try
        {
            await app.RefreshCsrfAsync(client);
            using var response = await client.PostAsJsonAsync("/api/auth/register", new
            {
                username,
                fullName,
                phone,
                address = "Melaka",
                password
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var userId = body.RootElement.GetProperty("id").GetInt32();
            var customerId = body.RootElement.GetProperty("customerId").GetInt32();
            await app.RefreshCsrfAsync(client);
            return new RegisteredCustomerSession(client, userId, customerId);
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    private sealed record IdPayload(int Id);

    private sealed record RegisteredCustomerSession(HttpClient Client, int UserId, int CustomerId) : IDisposable
    {
        public void Dispose() => Client.Dispose();
    }
}
