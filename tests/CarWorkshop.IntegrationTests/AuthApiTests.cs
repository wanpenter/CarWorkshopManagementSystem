using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CarWorkshop.IntegrationTests;

public sealed class AuthApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Anonymous_requests_are_denied_for_every_operational_module()
    {
        using var client = app.CreateAnonymousClient();
        foreach (var path in new[]
                 {
                     "/api/customers", "/api/vehicles", "/api/appointments", "/api/services",
                     "/api/mechanics", "/api/cars", "/api/users"
                 })
        {
            using var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        await app.RefreshCsrfAsync(client);
        using var write = await client.PostAsJsonAsync("/api/customers", ValidCustomer());
        Assert.Equal(HttpStatusCode.Unauthorized, write.StatusCode);
    }

    [Fact]
    public async Task Valid_login_sets_a_session_and_me_returns_the_current_user()
    {
        var account = await app.CreateAccountAsync();
        using var client = await app.LoginAsync(account.Username, account.Password);

        using var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(account.Id, body.RootElement.GetProperty("id").GetInt32());
        Assert.Equal(account.Username, body.RootElement.GetProperty("username").GetString());
        Assert.Equal(account.FullName, body.RootElement.GetProperty("fullName").GetString());
        Assert.Equal("Staff", body.RootElement.GetProperty("role").GetString());
    }

    [Fact]
    public async Task Wrong_password_and_inactive_account_have_the_same_generic_failure()
    {
        var active = await app.CreateAccountAsync();
        var inactive = await app.CreateAccountAsync(isActive: false);
        using var activeClient = app.CreateAnonymousClient();
        using var inactiveClient = app.CreateAnonymousClient();

        using var wrongPassword = await LoginAttemptAsync(activeClient, active.Username, "Wrong!Password#2039");
        using var inactiveLogin = await LoginAttemptAsync(inactiveClient, inactive.Username, inactive.Password);

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, inactiveLogin.StatusCode);
        Assert.Equal(await ProblemDetailAsync(wrongPassword), await ProblemDetailAsync(inactiveLogin));
    }

    [Fact]
    public async Task Staff_can_use_operational_data_but_cannot_administer_users()
    {
        var account = await app.CreateAccountAsync();
        using var client = await app.LoginAsync(account.Username, account.Password);

        using var read = await client.GetAsync("/api/customers");
        using var write = await client.PostAsJsonAsync("/api/customers", ValidCustomer());
        using var userList = await client.GetAsync("/api/users");
        using var userCreate = await client.PostAsJsonAsync("/api/users", new
        {
            username = $"forbidden.{Guid.NewGuid():N}"[..30],
            fullName = "Forbidden account",
            password = "Valid!Password#2039",
            role = "Staff",
            isActive = true
        });

        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        Assert.Equal(HttpStatusCode.Created, write.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userCreate.StatusCode);
    }

    [Fact]
    public async Task Admin_user_listing_returns_only_the_documented_safe_account_fields()
    {
        var account = await app.CreateAccountAsync();

        using var response = await app.Client.GetAsync("/api/users");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var listed = body.RootElement.EnumerateArray()
            .Single(user => user.GetProperty("id").GetInt32() == account.Id);
        Assert.Equal(account.Username, listed.GetProperty("username").GetString());
        Assert.Equal(account.FullName, listed.GetProperty("fullName").GetString());
        Assert.Equal("Staff", listed.GetProperty("role").GetString());
        Assert.True(listed.GetProperty("isActive").GetBoolean());
        Assert.Equal(DateTimeKind.Utc, listed.GetProperty("createdAtUtc").GetDateTime().Kind);
        Assert.True(new HashSet<string>(listed.EnumerateObject().Select(property => property.Name))
            .SetEquals(["id", "username", "fullName", "role", "isActive", "createdAtUtc"]));
    }

    [Fact]
    public async Task Csrf_is_required_for_login_and_authenticated_writes()
    {
        var account = await app.CreateAccountAsync();
        using var noTokenClient = app.CreateAnonymousClient();
        using var missingLoginToken = await noTokenClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = account.Username,
            password = account.Password
        });
        Assert.Equal(HttpStatusCode.BadRequest, missingLoginToken.StatusCode);

        using var invalidTokenClient = app.CreateAnonymousClient();
        await app.RefreshCsrfAsync(invalidTokenClient);
        invalidTokenClient.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        invalidTokenClient.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "not-a-valid-token");
        using var invalidLoginToken = await invalidTokenClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = account.Username,
            password = account.Password
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidLoginToken.StatusCode);

        using var authenticated = await app.LoginAsync(account.Username, account.Password);
        authenticated.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        using var missingWriteToken = await authenticated.PostAsJsonAsync("/api/customers", ValidCustomer());
        Assert.Equal(HttpStatusCode.BadRequest, missingWriteToken.StatusCode);

        authenticated.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "not-a-valid-token");
        using var invalidWriteToken = await authenticated.PostAsJsonAsync("/api/customers", ValidCustomer());
        Assert.Equal(HttpStatusCode.BadRequest, invalidWriteToken.StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_server_session_even_when_the_cookie_is_replayed()
    {
        var account = await app.CreateAccountAsync();
        using var client = app.CreateAnonymousClient(handleCookies: false);
        var cookies = new Dictionary<string, string>(StringComparer.Ordinal);

        var anonymousToken = await FetchRawCsrfAsync(client, cookies);
        using var loginRequest = JsonRequest(HttpMethod.Post, "/api/auth/login", new
        {
            username = account.Username,
            password = account.Password
        }, cookies, anonymousToken);
        using var login = await client.SendAsync(loginRequest);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        CaptureCookies(login, cookies);

        var authenticatedToken = await FetchRawCsrfAsync(client, cookies);
        var replayedCookie = CookieHeader(cookies);
        using var logoutRequest = JsonRequest(HttpMethod.Post, "/api/auth/logout", new { }, cookies, authenticatedToken);
        using var logout = await client.SendAsync(logoutRequest);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        using var replay = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        replay.Headers.TryAddWithoutValidation("Cookie", replayedCookie);
        using var afterLogout = await client.SendAsync(replay);
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogout.StatusCode);
    }

    [Fact]
    public async Task Changing_password_revokes_all_sessions_and_invalidates_the_old_password()
    {
        var account = await app.CreateAccountAsync();
        using var firstSession = await app.LoginAsync(account.Username, account.Password);
        using var secondSession = await app.LoginAsync(account.Username, account.Password);
        const string newPassword = "Changed!Password#2040";

        using var changed = await firstSession.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = account.Password,
            newPassword
        });
        Assert.Equal(HttpStatusCode.NoContent, changed.StatusCode);

        using var firstMe = await firstSession.GetAsync("/api/auth/me");
        using var secondMe = await secondSession.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, firstMe.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, secondMe.StatusCode);

        using var oldPasswordClient = app.CreateAnonymousClient();
        using var oldPassword = await LoginAttemptAsync(oldPasswordClient, account.Username, account.Password);
        Assert.Equal(HttpStatusCode.Unauthorized, oldPassword.StatusCode);
        using var newPasswordClient = await app.LoginAsync(account.Username, newPassword);
        using var newMe = await newPasswordClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, newMe.StatusCode);
    }

    [Fact]
    public async Task Admin_password_reset_revokes_sessions_and_replaces_the_old_password()
    {
        var account = await app.CreateAccountAsync();
        using var userSession = await app.LoginAsync(account.Username, account.Password);
        const string resetPassword = "Reset!Password#2041";

        using var reset = await app.Client.PostAsJsonAsync($"/api/users/{account.Id}/reset-password", new
        {
            newPassword = resetPassword
        });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        using var staleSession = await userSession.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, staleSession.StatusCode);
        using var oldPasswordClient = app.CreateAnonymousClient();
        using var oldPassword = await LoginAttemptAsync(oldPasswordClient, account.Username, account.Password);
        Assert.Equal(HttpStatusCode.Unauthorized, oldPassword.StatusCode);
        using var replacementSession = await app.LoginAsync(account.Username, resetPassword);
        using var replacementMe = await replacementSession.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, replacementMe.StatusCode);
    }

    [Fact]
    public async Task Password_changes_and_resets_validate_credentials_before_mutating_the_account()
    {
        var account = await app.CreateAccountAsync();
        using var userSession = await app.LoginAsync(account.Username, account.Password);

        using var wrongCurrent = await userSession.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = "Wrong!Password#2039",
            newPassword = "Otherwise!Valid#2042"
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongCurrent.StatusCode);

        using var shortChange = await userSession.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = account.Password,
            newPassword = "TooShort1!"
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortChange.StatusCode);

        using var shortReset = await app.Client.PostAsJsonAsync($"/api/users/{account.Id}/reset-password", new
        {
            newPassword = "TooShort1!"
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortReset.StatusCode);

        using var unchangedSession = await userSession.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, unchangedSession.StatusCode);
        using var unchangedCredentials = await app.LoginAsync(account.Username, account.Password);
        using var unchangedMe = await unchangedCredentials.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, unchangedMe.StatusCode);
    }

    [Fact]
    public async Task Deactivation_and_role_changes_immediately_revoke_existing_sessions()
    {
        var deactivated = await app.CreateAccountAsync();
        using var deactivatedSession = await app.LoginAsync(deactivated.Username, deactivated.Password);
        using var deactivate = await app.Client.PutAsJsonAsync($"/api/users/{deactivated.Id}", new
        {
            fullName = deactivated.FullName,
            role = "Staff",
            isActive = false
        });
        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);
        using var afterDeactivation = await deactivatedSession.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, afterDeactivation.StatusCode);

        var promoted = await app.CreateAccountAsync();
        using var staffSession = await app.LoginAsync(promoted.Username, promoted.Password);
        using var promote = await app.Client.PutAsJsonAsync($"/api/users/{promoted.Id}", new
        {
            fullName = promoted.FullName,
            role = "Admin",
            isActive = true
        });
        Assert.Equal(HttpStatusCode.OK, promote.StatusCode);
        using var staleRoleSession = await staffSession.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, staleRoleSession.StatusCode);

        using var adminSession = await app.LoginAsync(promoted.Username, promoted.Password);
        using var users = await adminSession.GetAsync("/api/users");
        Assert.Equal(HttpStatusCode.OK, users.StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_demote_or_deactivate_their_own_account()
    {
        using var meResponse = await app.Client.GetAsync("/api/auth/me");
        using var me = JsonDocument.Parse(await meResponse.Content.ReadAsStringAsync());
        var adminId = me.RootElement.GetProperty("id").GetInt32();
        var fullName = me.RootElement.GetProperty("fullName").GetString();

        using var deactivate = await app.Client.PutAsJsonAsync($"/api/users/{adminId}", new
        {
            fullName,
            role = "Admin",
            isActive = false
        });
        using var demote = await app.Client.PutAsJsonAsync($"/api/users/{adminId}", new
        {
            fullName,
            role = "Staff",
            isActive = true
        });

        Assert.Equal(HttpStatusCode.Conflict, deactivate.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, demote.StatusCode);
        using var stillAuthenticated = await app.Client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, stillAuthenticated.StatusCode);
    }

    [Fact]
    public async Task Usernames_are_case_insensitively_unique_and_credentials_are_validated()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var username = $"Case.User.{suffix}";
        await app.CreateAccountAsync(username: username);

        using var duplicate = await app.Client.PostAsJsonAsync("/api/users", new
        {
            username = username.ToLowerInvariant(),
            fullName = "Duplicate user",
            password = "Valid!Password#2039",
            role = "Staff",
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        using var shortPassword = await app.Client.PostAsJsonAsync("/api/users", new
        {
            username = $"short.{suffix}",
            fullName = "Short password",
            password = "TooShort1!",
            role = "Staff",
            isActive = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortPassword.StatusCode);

        using var shortUsername = await app.Client.PostAsJsonAsync("/api/users", new
        {
            username = "ab",
            fullName = "Short username",
            password = "Valid!Password#2039",
            role = "Staff",
            isActive = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortUsername.StatusCode);

        using var longPassword = await app.Client.PostAsJsonAsync("/api/users", new
        {
            username = $"long.{suffix}",
            fullName = "Long password",
            password = new string('x', 129),
            role = "Staff",
            isActive = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, longPassword.StatusCode);
    }

    [Fact]
    public async Task Five_failed_logins_lock_the_account_for_fifteen_minutes()
    {
        var account = await app.CreateAccountAsync();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            using var client = app.CreateAnonymousClient();
            using var failed = await LoginAttemptAsync(client, account.Username, "Wrong!Password#2039");
            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        }

        using (var lockedClient = app.CreateAnonymousClient())
        using (var locked = await LoginAttemptAsync(lockedClient, account.Username, account.Password))
            Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);

        app.AdvanceClock(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(1));
        using var recovered = await app.LoginAsync(account.Username, account.Password);
        using var me = await recovered.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    private async Task<HttpResponseMessage> LoginAttemptAsync(HttpClient client, string username, string password)
    {
        await app.RefreshCsrfAsync(client);
        return await client.PostAsJsonAsync("/api/auth/login", new { username, password });
    }

    private static async Task<string?> ProblemDetailAsync(HttpResponseMessage response)
    {
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.TryGetProperty("detail", out var detail)
            ? detail.GetString()
            : body.RootElement.GetProperty("title").GetString();
    }

    private static object ValidCustomer() => new
    {
        fullName = $"Auth test {Guid.NewGuid():N}",
        phone = "0123456789",
        address = "Integration suite"
    };

    private static async Task<string> FetchRawCsrfAsync(
        HttpClient client,
        IDictionary<string, string> cookies)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/csrf");
        if (cookies.Count > 0)
            request.Headers.TryAddWithoutValidation("Cookie", CookieHeader(cookies));
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        CaptureCookies(response, cookies);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.GetProperty("token").GetString()
            ?? throw new InvalidOperationException("The CSRF response did not contain a token.");
    }

    private static HttpRequestMessage JsonRequest(
        HttpMethod method,
        string path,
        object body,
        IReadOnlyDictionary<string, string> cookies,
        string csrfToken)
    {
        var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.TryAddWithoutValidation("Cookie", CookieHeader(cookies));
        request.Headers.Add("X-CSRF-TOKEN", csrfToken);
        return request;
    }

    private static void CaptureCookies(
        HttpResponseMessage response,
        IDictionary<string, string> cookies)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var values))
            return;

        foreach (var value in values)
        {
            var pair = value.Split(';', 2)[0];
            var separator = pair.IndexOf('=');
            if (separator <= 0)
                continue;
            var name = pair[..separator];
            var cookieValue = pair[(separator + 1)..];
            if (cookieValue.Length == 0)
                cookies.Remove(name);
            else
                cookies[name] = cookieValue;
        }
    }

    private static string CookieHeader(IEnumerable<KeyValuePair<string, string>> cookies) =>
        string.Join("; ", cookies.Select(cookie => $"{cookie.Key}={cookie.Value}"));
}

public sealed class SessionExpiryApiTests(BookingApiFactory app) : IClassFixture<BookingApiFactory>
{
    [Fact]
    public async Task Session_cookie_and_database_session_expire_after_eight_hours()
    {
        var account = await app.CreateAccountAsync();
        using var session = await app.LoginAsync(account.Username, account.Password);
        using var beforeExpiry = await session.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, beforeExpiry.StatusCode);

        app.AdvanceClock(TimeSpan.FromHours(8) + TimeSpan.FromSeconds(1));

        using var afterExpiry = await session.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, afterExpiry.StatusCode);
    }
}
