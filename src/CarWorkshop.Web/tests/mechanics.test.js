import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient, validateMechanic } from "../src/api.js";

test("mechanic input follows backend name and phone limits", () => {
  assert.deepEqual(validateMechanic({ fullName: "  Ali  ", phone: " +60 12-345 6789 ", isActive: false }).values, { fullName: "Ali", phone: "+60 12-345 6789", isActive: false });
  for (const phone of ["123456", "1234567890123456", "12+3456789", "++60123456789", "abc1234567", "(  1234567  )         8"]) {
    assert.equal(validateMechanic({ fullName: "Ali", phone }).valid, false, phone);
  }
  assert.equal(validateMechanic({ fullName: "", phone: "0123456789" }).valid, false);
  assert.equal(validateMechanic({ fullName: "x".repeat(101), phone: "0123456789" }).valid, false);
  assert.equal(validateMechanic({ fullName: "Ali", phone: "0123456789" }).values.isActive, true);
});

test("mechanic API writes and assignment use the backend contract", async () => {
  const calls = [];
  const api = createApiClient("https://workshop.test", { fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  const mechanic = { fullName: "Ali", phone: "0123456789", isActive: true };
  await api.getMechanics();
  await api.addMechanic(mechanic);
  await api.updateMechanic(3, { ...mechanic, isActive: false });
  await api.assignMechanic(9, 3);
  assert.deepEqual(calls.map((call) => [call.url, call.method]), [
    ["https://workshop.test/api/mechanics", "GET"],
    ["https://workshop.test/api/mechanics", "POST"],
    ["https://workshop.test/api/mechanics/3", "PUT"],
    ["https://workshop.test/api/appointments/9/mechanic", "PUT"]
  ]);
  assert.deepEqual(calls[1].body, mechanic);
  assert.equal(calls[2].body.isActive, false);
  assert.deepEqual(calls[3].body, { mechanicId: 3 });
});

test("assignment conflicts keep the API recovery message", async () => {
  const api = createApiClient("https://workshop.test", { fetchImpl: async () => new Response(JSON.stringify({ detail: "This mechanic already has an overlapping appointment." }), { status: 409, headers: { "Content-Type": "application/problem+json" } }) });
  await assert.rejects(api.assignMechanic(9, 3), (error) => error instanceof ApiError && error.status === 409 && /overlapping appointment/.test(error.message));
});
