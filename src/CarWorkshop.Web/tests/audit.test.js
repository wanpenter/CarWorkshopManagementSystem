import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/api.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("getAuditLogs encodes filters and pagination query parameters", async () => {
  const requests = [];
  const api = createApiClient("https://workshop.test", {
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method });
      return json({ items: [], page: 2, pageSize: 20, totalCount: 0, totalPages: 0 });
    }
  });

  await api.getAuditLogs({ entityType: "Appointment", search: "admin", page: 2, pageSize: 20 });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  const parsed = new URL(requests[0].url);
  assert.equal(parsed.pathname, "/api/audit-logs");
  assert.equal(parsed.searchParams.get("entityType"), "Appointment");
  assert.equal(parsed.searchParams.get("search"), "admin");
  assert.equal(parsed.searchParams.get("page"), "2");
  assert.equal(parsed.searchParams.get("pageSize"), "20");
});

test("getAuditLogs 403 does not expire the user session", async () => {
  let expired = 0;
  const api = createApiClient("https://workshop.test", {
    onUnauthorized: () => expired++,
    fetchImpl: async () => json({ detail: "Admin only" }, 403)
  });

  await assert.rejects(api.getAuditLogs(), /Admin only/);
  assert.equal(expired, 0);
});
