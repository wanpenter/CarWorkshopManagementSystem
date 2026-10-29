import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient, getProblemFieldErrors } from "../src/api.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("account validation fields map to the editable password controls", () => {
  assert.deepEqual(getProblemFieldErrors({ problem: { errors: { CurrentPassword: ["Incorrect password"], NewPassword: ["Too short"], Username: ["Required"] } } }), { currentPassword: "Incorrect password", newPassword: "Too short", username: "Required" });
});

test("cookie credentials and fresh CSRF tokens accompany every write, including login/logout", async () => {
  const calls = [];
  let issued = 0;
  const api = createApiClient("https://workshop.test", { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/csrf") ? json({ token: `csrf-${++issued}` }) : json({ id: 1, role: "Admin" });
  } });
  await api.login({ username: "admin", password: "test-only-password" });
  await api.addCustomer({ fullName: "Customer" });
  await api.logout();
  const writes = calls.filter(({ options }) => options.method === "POST");
  assert.equal(writes.length, 3);
  assert.deepEqual(writes.map(({ options }) => options.headers["X-CSRF-TOKEN"]), ["csrf-1", "csrf-2", "csrf-3"]);
  assert.ok(calls.every(({ options }) => options.credentials === "include" && options.cache === "no-store"));
  assert.equal(writes[2].options.body, undefined);
});

test("a missing CSRF response prevents the mutation", async () => {
  const paths = [];
  const api = createApiClient("https://workshop.test", { fetchImpl: async (url) => { paths.push(url); return json({}); } });
  await assert.rejects(api.addUser({}), /security token/);
  assert.deepEqual(paths, ["https://workshop.test/api/auth/csrf"]);
});

test("401 on protected records expires UI session; wrong login and initial check do not", async () => {
  let expired = 0;
  const api = createApiClient("https://workshop.test", { onUnauthorized: () => expired++, fetchImpl: async (url) => url.endsWith("/csrf") ? json({ token: "test" }) : json({ detail: "Unauthorized" }, 401) });
  await assert.rejects(api.getCurrentUser());
  await assert.rejects(api.login({ username: "bad", password: "bad" }));
  assert.equal(expired, 0);
  await assert.rejects(api.getCustomers());
  assert.equal(expired, 1);
});

test("admin and account endpoints use exact payloads and a 403 keeps the session", async () => {
  let expired = 0;
  const writes = [];
  const api = createApiClient("https://workshop.test", { onUnauthorized: () => expired++, fetchImpl: async (url, options) => {
    if (url.endsWith("/csrf")) return json({ token: "test" });
    writes.push({ path: new URL(url).pathname, method: options.method, body: options.body && JSON.parse(options.body) });
    return json({ detail: "Admin only" }, 403);
  } });
  await assert.rejects(api.getUsers());
  await assert.rejects(api.addUser({ username: "staff", role: "Staff" }));
  await assert.rejects(api.updateUser(2, { fullName: "Staff", role: "Admin", isActive: true }));
  await assert.rejects(api.resetUserPassword(2, "new-test-password"));
  await assert.rejects(api.changePassword({ currentPassword: "old", newPassword: "new" }));
  assert.deepEqual(writes.map(({ path, method }) => [path, method]), [["/api/users", "GET"], ["/api/users", "POST"], ["/api/users/2", "PUT"], ["/api/users/2/reset-password", "POST"], ["/api/auth/change-password", "POST"]]);
  assert.deepEqual(writes[3].body, { newPassword: "new-test-password" });
  assert.equal(expired, 0);
});
