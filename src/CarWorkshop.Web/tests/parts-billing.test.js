import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient, validatePart } from "../src/api.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("validatePart normalizes SKU, validates decimals and stock bounds, and supports edit mode without stock", () => {
  const created = validatePart({
    sku: "  oil-5w30_4l ",
    name: "Fully Synthetic 5W-30",
    description: "4L bottle",
    unitPrice: "145.50",
    stockQuantity: "12",
    lowStockThreshold: "3",
    isActive: true
  });
  assert.equal(created.valid, true);
  assert.equal(created.values.sku, "OIL-5W30_4L");
  assert.equal(created.values.unitPrice, 145.5);
  assert.equal(created.values.stockQuantity, 12);

  const invalid = validatePart({
    sku: "BAD SKU!",
    name: "",
    unitPrice: "12.999",
    stockQuantity: "-1",
    lowStockThreshold: "-2"
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.sku);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.unitPrice);
  assert.ok(invalid.errors.stockQuantity);
  assert.ok(invalid.errors.lowStockThreshold);

  const edited = validatePart(
    {
      sku: "FLT-01",
      name: "Oil Filter",
      description: "",
      unitPrice: "35",
      lowStockThreshold: "5",
      isActive: false
    },
    { includeStock: false }
  );
  assert.equal(edited.valid, true);
  assert.equal("stockQuantity" in edited.values, false);
  assert.equal(edited.values.isActive, false);
});

test("availability, parts inventory, appointment parts, and payment endpoints send exact routes and CSRF tokens", async () => {
  const calls = [];
  let tokenCounter = 0;
  const api = createApiClient("https://workshop.test", {
    fetchImpl: async (url, options) => {
      if (url.endsWith("/api/auth/csrf")) return json({ token: `csrf-${++tokenCounter}` });
      const parsed = new URL(url);
      calls.push({
        pathWithQuery: `${parsed.pathname}${parsed.search}`,
        method: options.method,
        csrf: options.headers["X-CSRF-TOKEN"],
        body: options.body ? JSON.parse(options.body) : undefined
      });
      return json({ ok: true });
    }
  });

  await api.getPortalAvailability({ date: "2026-12-01", durationMinutes: 60, vehicleId: 7 });
  await api.getWorkshopAvailability({ date: "2026-12-01", durationMinutes: 90, vehicleId: 7, excludeAppointmentId: 12 });
  await api.getParts();
  await api.addPart({ sku: "FLT-01", name: "Oil Filter", unitPrice: 35, stockQuantity: 10, lowStockThreshold: 2, isActive: true });
  await api.updatePart(4, { sku: "FLT-01", name: "Oil Filter OEM", unitPrice: 40, lowStockThreshold: 3, isActive: true });
  await api.adjustPartStock(4, { delta: 5, reason: "Restock" });
  await api.addAppointmentPart(12, { partId: 4, quantity: 2 });
  await api.removeAppointmentPart(12, 99);
  await api.recordAppointmentPayment(12, { amount: 250.5, method: "DuitNowQR", reference: "DN-101" });

  assert.deepEqual(
    calls.map(({ pathWithQuery, method }) => [pathWithQuery, method]),
    [
      ["/api/portal/availability?date=2026-12-01&durationMinutes=60&vehicleId=7", "GET"],
      ["/api/appointments/availability?date=2026-12-01&durationMinutes=90&vehicleId=7&excludeAppointmentId=12", "GET"],
      ["/api/parts", "GET"],
      ["/api/parts", "POST"],
      ["/api/parts/4", "PUT"],
      ["/api/parts/4/adjust-stock", "POST"],
      ["/api/appointments/12/parts", "POST"],
      ["/api/appointments/12/parts/99", "DELETE"],
      ["/api/appointments/12/payment", "POST"]
    ]
  );

  const writes = calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 6);
  assert.ok(writes.every((call) => call.csrf?.startsWith("csrf-")));
  assert.deepEqual(calls[8].body, { amount: 250.5, method: "DuitNowQR", reference: "DN-101" });
});
