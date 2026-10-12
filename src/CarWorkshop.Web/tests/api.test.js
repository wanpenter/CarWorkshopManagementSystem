import assert from "node:assert/strict";
import test from "node:test";
import {
  API_STORAGE_KEY,
  ApiError,
  canonicalizeRegistration,
  createApiClient,
  getProblemFieldErrors,
  resolveInitialApiBaseUrl,
  saveApiBaseUrl,
  validateApiBaseUrl,
  validateCustomer,
  validateVehicle
} from "../src/api.js";

test("API URL validation normalizes a path and rejects unsafe URL parts", () => {
  assert.deepEqual(
    validateApiBaseUrl(" https://api.example.test/workshop/// ", { pageUrl: "https://app.example.test" }),
    { ok: true, value: "https://api.example.test/workshop" }
  );
  assert.equal(validateApiBaseUrl("ftp://api.example.test").ok, false);
  assert.match(validateApiBaseUrl("https://user:secret@api.example.test").error, /credentials/i);
  assert.match(validateApiBaseUrl("https://api.example.test?token=secret").error, /query/i);
  assert.match(validateApiBaseUrl("https://api.example.test#customers").error, /fragments/i);
  assert.match(
    validateApiBaseUrl("http://api.example.test", { pageUrl: "https://app.example.test" }).error,
    /HTTPS page cannot call an HTTP API/i
  );
});

test("initial URL falls back when browser storage throws or contains invalid data", () => {
  const blocked = resolveInitialApiBaseUrl({
    storage: { getItem() { throw new Error("storage blocked"); } },
    environmentUrl: "https://api.example.test",
    pageUrl: "https://app.example.test"
  });
  assert.equal(blocked.url, "https://api.example.test");
  assert.equal(blocked.storageError, true);

  const invalid = resolveInitialApiBaseUrl({
    storage: { getItem: () => "javascript:alert(1)" },
    environmentUrl: "https://api.example.test",
    pageUrl: "https://app.example.test"
  });
  assert.equal(invalid.source, "environment");
  assert.equal(invalid.invalidStoredValue, true);
  assert.equal(saveApiBaseUrl(null, "http://localhost:5272").ok, false);
});

test("customer validation trims values and validates phone digits", () => {
  assert.deepEqual(validateCustomer({ fullName: " Nur Aina ", phone: " +60 12-345 6789 ", address: " " }), {
    values: { fullName: "Nur Aina", phone: "+60 12-345 6789", address: null },
    errors: {},
    valid: true
  });
  const invalid = validateCustomer({ fullName: " ", phone: "12A", address: "x".repeat(501) });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.fullName, /full name/i);
  assert.match(invalid.errors.phone, /digits|spaces/i);
  assert.match(invalid.errors.address, /500/);
});

test("vehicle validation canonicalizes registration and normalizes optional values", () => {
  assert.equal(canonicalizeRegistration(" mbc-12 34 "), "MBC1234");
  assert.deepEqual(
    validateVehicle({ customerId: "7", registrationNumber: " mbc-12 34 ", make: " Perodua ", model: " Myvi ", year: "", mileage: "", isActive: true }, { currentYear: 2026 }),
    {
      values: { customerId: 7, registrationNumber: "MBC1234", make: "Perodua", model: "Myvi", year: null, mileage: 0, isActive: true },
      errors: {},
      valid: true
    }
  );
});

test("vehicle validation rejects invalid owner, year, mileage, and registration", () => {
  const invalid = validateVehicle({
    customerId: "",
    registrationNumber: "ABC@123",
    make: "",
    model: "",
    year: "1899",
    mileage: "-1",
    isActive: false
  }, { currentYear: 2026 });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.customerId, /owner/i);
  assert.match(invalid.errors.registrationNumber, /letters and numbers/i);
  assert.match(invalid.errors.year, /1900/);
  assert.match(invalid.errors.mileage, /0 or more/i);
});

test("API client calls customer and vehicle routes with JSON writes and owner filtering", async () => {
  const calls = [];
  const client = createApiClient("http://localhost:5272/workshop/", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  await client.addCustomer({ fullName: "Nur Aina", phone: "0123456789", address: null });
  await client.getVehicles({ customerId: 7 });
  await client.updateVehicle(11, { customerId: 7, registrationNumber: "MBC1234", make: "Perodua", model: "Myvi", year: null, mileage: 0, isActive: true });

  assert.equal(calls[0].url, "http://localhost:5272/workshop/api/customers");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].url, "http://localhost:5272/workshop/api/vehicles?customerId=7");
  assert.equal(calls[2].url, "http://localhost:5272/workshop/api/vehicles/11");
  assert.equal(calls[2].options.method, "PUT");
  assert.equal(calls[2].options.headers["Content-Type"], "application/json");
});

test("ProblemDetails field names map to React form fields", async () => {
  const client = createApiClient("http://localhost:5272", {
    fetchImpl: async () => new Response(JSON.stringify({
      title: "One or more validation errors occurred.",
      errors: {
        "request.FullName": ["Full name is required."],
        RegistrationNumber: ["Registration number already exists."],
        CustomerId: ["Customer was not found."]
      }
    }), { status: 400, headers: { "content-type": "application/problem+json" } })
  });

  await assert.rejects(client.addVehicle({}), (error) => {
    assert.ok(error instanceof ApiError);
    assert.deepEqual(getProblemFieldErrors(error), {
      fullName: "Full name is required.",
      registrationNumber: "Registration number already exists.",
      customerId: "Customer was not found."
    });
    return true;
  });
});

test("404 response provides a recovery message", async () => {
  const client = createApiClient("http://localhost:5272", {
    fetchImpl: async () => new Response(null, { status: 404 })
  });
  await assert.rejects(client.getCustomer(404), (error) => {
    assert.equal(error.status, 404);
    assert.match(error.message, /no longer exists/i);
    assert.match(error.message, /reload/i);
    return true;
  });
});

test("409 response keeps the server conflict detail", async () => {
  const client = createApiClient("http://localhost:5272", {
    fetchImpl: async () => new Response(JSON.stringify({
      title: "Conflict",
      detail: "Registration number ABC123 is already assigned to another vehicle."
    }), { status: 409, headers: { "content-type": "application/problem+json" } })
  });
  await assert.rejects(client.addVehicle({}), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /ABC123/);
    return true;
  });
});

test("API client aborts a request that exceeds its timeout", async () => {
  const client = createApiClient("http://localhost:5272", {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })
  });
  await assert.rejects(client.getCustomers(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.match(error.message, /too long/i);
    return true;
  });
});

test("network failures are reported with a recovery-oriented message", async () => {
  const client = createApiClient("http://localhost:5272", {
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); }
  });
  await assert.rejects(client.getCustomers(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.match(error.message, /could not reach the API/i);
    assert.match(error.message, /CORS/i);
    return true;
  });
});

test("storage writes use the scoped frontend key", () => {
  const written = new Map();
  const result = saveApiBaseUrl({ setItem: (key, value) => written.set(key, value) }, "http://localhost:5272");
  assert.equal(result.ok, true);
  assert.equal(written.get(API_STORAGE_KEY), "http://localhost:5272");
});
