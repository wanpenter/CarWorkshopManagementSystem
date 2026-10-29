import { useEffect, useRef, useState } from "react";
import { ApiError, getProblemFieldErrors } from "../api.js";

const EMPTY_ERRORS = Object.freeze({ username: "", password: "", form: "" });

function PasswordField({ id, inputRef, value, error, visible, disabled, onChange, onToggle }) {
  const describedBy = error ? `${id}-error` : undefined;
  return (
    <div className="auth-field">
      <label htmlFor={id}>Password</label>
      <div className="auth-password-control">
        <input
          ref={inputRef}
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          value={value}
          disabled={disabled}
          required
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
          onClick={onToggle}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error && <p id={`${id}-error`} className="auth-field-error" role="alert">{error}</p>}
    </div>
  );
}

export default function LoginScreen({
  status,
  errorMessage,
  busy = false,
  onLogin,
  onRetry,
  onOpenSettings
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState(EMPTY_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (status === "signedOut") usernameRef.current?.focus();
  }, [status]);

  const working = busy || submitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (working) return;

    const nextErrors = { ...EMPTY_ERRORS };
    const cleanUsername = username.trim();
    if (!cleanUsername) nextErrors.username = "Enter your username.";
    if (!password) nextErrors.password = "Enter your password.";
    if (nextErrors.username || nextErrors.password) {
      setErrors(nextErrors);
      if (nextErrors.username) usernameRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setErrors(EMPTY_ERRORS);
    setSubmitting(true);
    try {
      await onLogin({ username: cleanUsername, password });
      setPassword("");
      setShowPassword(false);
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      const next = {
        username: fields.username ?? "",
        password: fields.password ?? "",
        form: error instanceof ApiError ? error.message : "Sign in could not be completed. Try again."
      };
      setErrors(next);
      if (next.username) usernameRef.current?.focus();
      else if (next.password) passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  const isChecking = status === "checking";
  const isConnectionError = status === "error";

  return (
    <main className="auth-screen">
      <section className="auth-brand-panel" aria-labelledby="auth-brand-title">
        <div className="auth-brand-lockup">
          <span>Workshop Registry</span>
        </div>
        <div className="auth-brand-copy">
          <h1 id="auth-brand-title">Run the day from one clear workspace.</h1>
          <p>Manage customer records, vehicles, appointments, services, and mechanic assignments.</p>
        </div>
        <p className="auth-brand-footnote">Authorised workshop staff only</p>
      </section>

      <section className="auth-entry-panel" aria-live="polite">
        <div className="auth-card">
          {isChecking && (
            <div className="auth-state" role="status">
              <div className="auth-loading-line" aria-hidden="true" />
              <h2>Checking your session</h2>
              <p>We are preparing your workshop workspace.</p>
            </div>
          )}

          {isConnectionError && (
            <div className="auth-state auth-error-state" role="alert">
              <span className="auth-state-symbol" aria-hidden="true">!</span>
              <h2>We could not reach the workshop system</h2>
              <p>{errorMessage || "Check that the service is available, then try again."}</p>
              <div className="auth-actions">
                <button type="button" className="button button-primary" disabled={busy} onClick={onRetry}>
                  {busy ? "Trying again..." : "Try again"}
                </button>
                <button type="button" className="button button-secondary" disabled={busy} onClick={onOpenSettings}>
                  API settings
                </button>
              </div>
            </div>
          )}

          {!isChecking && !isConnectionError && (
            <>
              <div className="auth-card-heading">
                <h2>Sign in to your workspace</h2>
                <p>Use the account issued by your workshop administrator.</p>
              </div>
              {errorMessage && <p className="auth-field-help mb-4" role="status">{errorMessage}</p>}
              <form noValidate onSubmit={handleSubmit}>
                {errors.form && <p className="auth-form-error" role="alert">{errors.form}</p>}

                <div className="auth-field">
                  <label htmlFor="login-username">Username</label>
                  <input
                    ref={usernameRef}
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={username}
                    disabled={working}
                    required
                    aria-invalid={errors.username ? "true" : undefined}
                    aria-describedby={errors.username ? "login-username-error" : undefined}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      if (errors.username || errors.form) setErrors((current) => ({ ...current, username: "", form: "" }));
                    }}
                  />
                  {errors.username && <p id="login-username-error" className="auth-field-error" role="alert">{errors.username}</p>}
                </div>

                <PasswordField
                  id="login-password"
                  inputRef={passwordRef}
                  value={password}
                  error={errors.password}
                  visible={showPassword}
                  disabled={working}
                  onChange={(value) => {
                    setPassword(value);
                    if (errors.password || errors.form) setErrors((current) => ({ ...current, password: "", form: "" }));
                  }}
                  onToggle={() => setShowPassword((value) => !value)}
                />

                <button type="submit" className="button button-primary auth-submit" disabled={working}>
                  {working ? "Signing in..." : "Sign in"}
                </button>
              </form>
              <button type="button" className="auth-settings-link" disabled={working} onClick={onOpenSettings}>
                Having trouble connecting? Open API settings
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
