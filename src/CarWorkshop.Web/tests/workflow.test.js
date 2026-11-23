import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/api.js";
import { formatReceiptNumber } from "../src/workshopProfile.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("formatReceiptNumber uses Malaysia year and 5-digit padded appointment id", () => {
  // 2026-12-31T17:00:00Z is 2027-01-01 01:00 MYT.
  assert.equal(
    formatReceiptNumber({ id: 15, scheduledAtUtc: "2026-12-31T17:00:00Z" }),
    "TP-2027-00015"
  );
  assert.equal(
    formatReceiptNumber({ id: 4, scheduledAtUtc: "2026-11-23T02:00:00Z" }),
    "TP-2026-00004"
  );
});

test("transitionAppointmentStatus and logReceiptPrinted use POST endpoints with CSRF", async () => {
  const calls = [];
  const api = createApiClient("https://workshop.test", {
    fetchImpl: async (url, options) => {
      if (url.endsWith("/api/auth/csrf")) return json({ token: "csrf-workflow" });
      calls.push({
        path: new URL(url).pathname,
        method: options.method,
        csrf: options.headers["X-CSRF-TOKEN"],
        body: options.body ? JSON.parse(options.body) : undefined
      });
      return options.method === "POST" && url.endsWith("/receipt-printed")
        ? new Response(null, { status: 204 })
        : json({ id: 12, status: "Cancelled", statusReason: "Customer rescheduled" });
    }
  });

  const updated = await api.transitionAppointmentStatus(12, { status: "Cancelled", reason: "Customer rescheduled" });
  await api.logReceiptPrinted(12);

  assert.equal(updated.status, "Cancelled");
  assert.deepEqual(calls, [
    {
      path: "/api/appointments/12/status",
      method: "POST",
      csrf: "csrf-workflow",
      body: { status: "Cancelled", reason: "Customer rescheduled" }
    },
    {
      path: "/api/appointments/12/receipt-printed",
      method: "POST",
      csrf: "csrf-workflow",
      body: undefined
    }
  ]);
});
