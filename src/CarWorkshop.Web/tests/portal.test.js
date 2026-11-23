import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient, resolvePortalRoute, validateAppointment, validateVehicle } from "../src/api.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("customer registration and portal endpoints send exact routes, payloads, and CSRF tokens", async () => {
  const calls = [];
  let tokenCounter = 0;
  const api = createApiClient("https://workshop.test", {
    fetchImpl: async (url, options) => {
      if (url.endsWith("/api/auth/csrf")) return json({ token: `csrf-${++tokenCounter}` });
      calls.push({
        path: new URL(url).pathname,
        method: options.method,
        csrf: options.headers["X-CSRF-TOKEN"],
        body: options.body ? JSON.parse(options.body) : undefined
      });
      return options.method === "DELETE" || url.endsWith("/receipt-printed")
        ? new Response(null, { status: 204 })
        : json({ id: 9, role: "Customer", customerId: 4 });
    }
  });

  await api.registerCustomer({ username: "ali.driver", fullName: "Ali", phone: "0123456789", password: "Valid!Password#2039" });
  await api.getPortalProfile();
  await api.updatePortalProfile({ fullName: "Ali Updated", phone: "0123456789", address: "Melaka" });
  await api.getPortalServices();
  await api.getPortalVehicles();
  await api.addPortalVehicle({ registrationNumber: "WXY1234", make: "Honda", model: "City", mileage: 1000, isActive: true });
  await api.updatePortalVehicle(5, { registrationNumber: "WXY1234", make: "Honda", model: "City", mileage: 2000, isActive: true });
  await api.deletePortalVehicle(5);
  await api.getPortalAppointments();
  await api.addPortalAppointment({ vehicleId: 5, scheduledAtUtc: "2040-01-01T01:00:00Z", serviceIds: [1], notes: "Check brakes" });
  await api.cancelPortalAppointment(9, "Rescheduling");
  await api.logPortalReceiptPrinted(9);

  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ["/api/auth/register", "POST"],
      ["/api/portal/profile", "GET"],
      ["/api/portal/profile", "PUT"],
      ["/api/portal/services", "GET"],
      ["/api/portal/vehicles", "GET"],
      ["/api/portal/vehicles", "POST"],
      ["/api/portal/vehicles/5", "PUT"],
      ["/api/portal/vehicles/5", "DELETE"],
      ["/api/portal/appointments", "GET"],
      ["/api/portal/appointments", "POST"],
      ["/api/portal/appointments/9/cancel", "POST"],
      ["/api/portal/appointments/9/receipt-printed", "POST"]
    ]
  );

  const writes = calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 8);
  assert.ok(writes.every((call) => call.csrf?.startsWith("csrf-")));
  assert.deepEqual(calls[10].body, { reason: "Rescheduling" });
});

test("portal validation helpers allow omitting customerId when requireCustomer is false", () => {
  const vehicle = validateVehicle(
    { registrationNumber: "jup 9381", make: "Honda", model: "City", year: "2022", mileage: "12000", isActive: true },
    { currentYear: 2026, requireCustomer: false }
  );
  assert.equal(vehicle.valid, true);
  assert.equal(vehicle.values.registrationNumber, "JUP9381");

  const booking = validateAppointment(
    {
      vehicleId: 5,
      scheduledAtLocal: "2040-06-15T09:30",
      serviceIds: [1, 2],
      totalMinutes: 60,
      notes: "Morning drop-off"
    },
    { now: new Date("2026-11-23T00:00:00Z"), requireCustomer: false }
  );
  assert.equal(booking.valid, true);
  assert.equal(booking.values.vehicleId, 5);
  assert.deepEqual(booking.values.serviceIds, [1, 2]);
});

test("resolvePortalRoute separates customer (/) and internal staff (/staff, /admin) portals", () => {
  assert.equal(resolvePortalRoute("/"), "customer");
  assert.equal(resolvePortalRoute("/portal"), "customer");
  assert.equal(resolvePortalRoute("/staff"), "staff");
  assert.equal(resolvePortalRoute("/staff/"), "staff");
  assert.equal(resolvePortalRoute("/staff/appointments"), "staff");
  assert.equal(resolvePortalRoute("/admin"), "staff");
  assert.equal(resolvePortalRoute("/ADMIN/users"), "staff");
});

test("enterprise staffLogin and customerLogin use separate endpoints and 401 does not expire session", async () => {
  const calls = [];
  let expired = 0;
  const api = createApiClient("https://workshop.test", {
    onUnauthorized: () => { expired++; },
    fetchImpl: async (url, options) => {
      if (url.endsWith("/api/auth/csrf")) return json({ token: "csrf-ent" });
      calls.push({ path: new URL(url).pathname, method: options.method, csrf: options.headers["X-CSRF-TOKEN"] });
      return json({ detail: "Invalid credentials or session." }, 401);
    }
  });

  await assert.rejects(api.staffLogin({ username: "cust", password: "wrong" }));
  await assert.rejects(api.customerLogin({ username: "staff", password: "wrong" }));

  assert.deepEqual(calls, [
    { path: "/api/auth/staff/login", method: "POST", csrf: "csrf-ent" },
    { path: "/api/auth/customer/login", method: "POST", csrf: "csrf-ent" }
  ]);
  assert.equal(expired, 0);
});
