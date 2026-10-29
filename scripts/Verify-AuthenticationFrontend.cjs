const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { chromium } = require(process.env.WORKSHOP_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  const adminUsername = process.env.WORKSHOP_ADMIN_USERNAME;
  const adminPassword = process.env.WORKSHOP_ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) throw new Error('Verification administrator environment is required.');
  const staffUsername = `staff-${crypto.randomBytes(4).toString('hex')}`;
  const initialPassword = crypto.randomBytes(18).toString('base64');
  const resetPassword = crypto.randomBytes(18).toString('base64');
  const changedPassword = crypto.randomBytes(18).toString('base64');
  const base = 'http://127.0.0.1:5273';
  const screenshot = (page, name) => page.screenshot({ path: path.resolve(`src/CarWorkshop.Web/.verification/auth-${name}.png`), fullPage: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem('car-workshop-api-base-url', 'http://127.0.0.1:5273'));
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    for (const route of ['customers', 'vehicles', 'services', 'appointments', 'mechanics', 'cars', 'users']) {
      assert.equal((await context.request.get(`${base}/api/${route}`)).status(), 401, `Anonymous ${route}`);
    }
    assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: adminUsername, password: adminPassword } })).status(), 400, 'Login without CSRF');
    await screenshot(page, 'login-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, 'login-mobile');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const login = async (target, username, password, success = true) => {
      await target.getByLabel('Username', { exact: true }).fill(username);
      await target.getByLabel('Password', { exact: true }).fill(password);
      const response = target.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
      await target.getByRole('button', { name: 'Sign in', exact: true }).click();
      assert.equal((await response).status(), success ? 200 : 401);
      if (success) await target.getByText('API connected', { exact: true }).waitFor({ state: 'attached' });
      else await target.locator('[role="alert"]').first().waitFor();
    };
    const tab = async (target, name) => {
      if (!await target.locator(`#${name}-nav`).isVisible()) await target.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await target.locator(`#${name}-nav`).click();
    };
    const write = async (target, button, route, method, status) => {
      const response = target.waitForResponse((r) => new URL(r.url()).pathname === route && r.request().method() === method);
      await button.click();
      const result = await response;
      assert.equal(result.status(), status, `${method} ${route}`);
      return status === 204 ? null : result.json();
    };
    await login(page, adminUsername, 'definitely-wrong-password', false);
    await login(page, adminUsername, adminPassword);
    const cookie = (await context.cookies(base)).find((item) => item.name === '.Workshop.Auth');
    assert.ok(cookie?.httpOnly);
    assert.equal(cookie.sameSite, 'Strict');
    const state = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    assert.ok(!state.includes(adminPassword) && !state.includes(cookie.value), 'No credentials in browser storage');
    await page.reload();
    await page.getByText('API connected', { exact: true }).waitFor({ state: 'attached' });
    await tab(page, 'users');
    const users = page.locator('section[aria-labelledby="users-title"]');
    await users.getByLabel('Username', { exact: true }).fill(staffUsername);
    await users.getByLabel('Full name', { exact: true }).fill('Authentication verification staff');
    await users.getByLabel('Password', { exact: true }).fill(initialPassword);
    await users.getByLabel('Confirm password', { exact: true }).fill(initialPassword);
    const staff = await write(page, users.getByRole('button', { name: 'Create user', exact: true }), '/api/users', 'POST', 201);
    assert.equal(staff.role, 'Staff');
    assert.equal('passwordHash' in staff, false);
    await screenshot(page, 'users-desktop');

    const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await staffContext.addInitScript(() => localStorage.setItem('car-workshop-api-base-url', 'http://127.0.0.1:5273'));
    const staffPage = await staffContext.newPage();
    staffPage.on('pageerror', (error) => errors.push(error.message));
    await staffPage.goto('http://127.0.0.1:4173');
    await login(staffPage, staffUsername, initialPassword);
    assert.equal(await staffPage.locator('#users-nav').count(), 0, 'Staff has no user management navigation');
    assert.equal((await staffContext.request.get(`${base}/api/users`)).status(), 403, 'Backend blocks Staff account management');
    assert.equal((await staffContext.request.get(`${base}/api/customers`)).status(), 200, 'Staff can operate workshop records');
    await tab(staffPage, 'account');
    await screenshot(staffPage, 'account-mobile');

    await users.getByLabel('New password', { exact: true }).fill(resetPassword);
    await users.getByLabel('Confirm new password', { exact: true }).fill(resetPassword);
    await write(page, users.getByRole('button', { name: 'Reset password', exact: true }), `/api/users/${staff.id}/reset-password`, 'POST', 204);
    await staffPage.bringToFront();
    await staffPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await staffPage.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal((await staffContext.request.get(`${base}/api/customers`)).status(), 401, 'Reset revoked old staff session');
    await login(staffPage, staffUsername, initialPassword, false);
    await login(staffPage, staffUsername, resetPassword);

    await users.getByLabel('Active account', { exact: true }).uncheck();
    await write(page, users.getByRole('button', { name: 'Save changes', exact: true }), `/api/users/${staff.id}`, 'PUT', 200);
    await staffPage.bringToFront();
    await staffPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await staffPage.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await login(staffPage, staffUsername, resetPassword, false);
    await users.getByLabel('Active account', { exact: true }).check();
    await write(page, users.getByRole('button', { name: 'Save changes', exact: true }), `/api/users/${staff.id}`, 'PUT', 200);
    await login(staffPage, staffUsername, resetPassword);
    await tab(staffPage, 'account');
    const account = staffPage.locator('section[aria-labelledby="account-title"]');
    await account.getByLabel('Current password', { exact: true }).fill(resetPassword);
    await account.getByLabel('New password', { exact: true }).fill(changedPassword);
    await account.getByLabel('Confirm new password', { exact: true }).fill(changedPassword);
    await write(staffPage, account.getByRole('button', { name: 'Change password', exact: true }), '/api/auth/change-password', 'POST', 204);
    await staffPage.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await login(staffPage, staffUsername, resetPassword, false);
    await login(staffPage, staffUsername, changedPassword);
    const staffCookie = (await staffContext.cookies(base)).find((item) => item.name === '.Workshop.Auth');
    await staffPage.getByRole('button', { name: 'Sign out', exact: true }).click();
    await staffPage.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(`${base}/api/customers`, { headers: { Cookie: `.Workshop.Auth=${staffCookie.value}` } })).status(), 401, 'Signed-out cookie cannot be replayed');
    await anonymous.close();

    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, 'users-mobile');
    for (const target of [page, staffPage]) assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Phone overflow');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(await page.locator('#dashboard-title').count(), 0, 'Workshop UI unmounted after logout');
    await context.close();
    await staffContext.close();
    assert.deepEqual(errors, [], 'Browser page errors');
    console.log('PASS: login/wrong password/reload/logout, Admin creates/updates/resets Staff, Staff authorization, password change, deactivation/reactivation, immediate session revocation and replay rejection.');
    console.log('PASS: HttpOnly Strict cookie, no local/session storage credentials, CSRF rejection, desktop/mobile auth screens and no page errors.');
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
