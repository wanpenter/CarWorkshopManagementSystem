import { useRef, useState } from "react";
import { ApiError, getProblemFieldErrors, validateCustomer } from "../api.js";

const EMPTY_LOGIN_ERRORS = Object.freeze({ username: "", password: "", form: "" });
const EMPTY_REGISTER_FORM = Object.freeze({
  username: "",
  fullName: "",
  phone: "",
  address: "",
  password: "",
  confirmPassword: ""
});
const EMPTY_REGISTER_ERRORS = Object.freeze({
  username: "",
  fullName: "",
  phone: "",
  address: "",
  password: "",
  confirmPassword: "",
  form: ""
});

function PasswordField({
  id,
  name = "password",
  label = "Password",
  autoComplete = "current-password",
  inputRef,
  value,
  error,
  help,
  visible,
  disabled,
  onChange,
  onToggle
}) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-control">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
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
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
          onClick={onToggle}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {help && <p id={`${id}-help`} className="auth-field-help">{help}</p>}
      {error && <p id={`${id}-error`} className="auth-field-error" role="alert">{error}</p>}
    </div>
  );
}

export default function LoginScreen({
  status,
  errorMessage,
  busy = false,
  onLogin,
  onRegister,
  onRetry,
  onOpenSettings
}) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState(EMPTY_LOGIN_ERRORS);

  const [regForm, setRegForm] = useState(EMPTY_REGISTER_FORM);
  const [regErrors, setRegErrors] = useState(EMPTY_REGISTER_ERRORS);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const regFormRef = useRef(null);

  const working = busy || submitting;

  function switchMode(nextMode) {
    if (working) return;
    setMode(nextMode);
    setErrors(EMPTY_LOGIN_ERRORS);
    setRegErrors(EMPTY_REGISTER_ERRORS);
    setPassword("");
    setShowPassword(false);
    setRegForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    setShowRegPassword(false);
    setShowRegConfirm(false);
  }

  function updateRegField(field, value) {
    setRegForm((current) => ({ ...current, [field]: value }));
    setRegErrors((current) => ({ ...current, [field]: "", form: "" }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (working) return;

    const nextErrors = { ...EMPTY_LOGIN_ERRORS };
    const cleanUsername = username.trim();
    if (!cleanUsername) nextErrors.username = "Enter your username.";
    if (!password) nextErrors.password = "Enter your password.";
    if (nextErrors.username || nextErrors.password) {
      setErrors(nextErrors);
      if (nextErrors.username) usernameRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setErrors(EMPTY_LOGIN_ERRORS);
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

  function focusFirstRegError(next) {
    const first = ["username", "fullName", "phone", "address", "password", "confirmPassword"].find((name) => next[name]);
    if (first) regFormRef.current?.elements.namedItem(first)?.focus();
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (working || !onRegister) return;

    const next = { ...EMPTY_REGISTER_ERRORS };
    const cleanUsername = regForm.username.trim();
    if (!cleanUsername) next.username = "Enter a username.";
    else if (cleanUsername.length < 3 || cleanUsername.length > 50) next.username = "Use 3 to 50 characters.";
    else if (!/^[A-Za-z0-9._-]+$/.test(cleanUsername)) next.username = "Use letters, numbers, periods, underscores, or hyphens only.";

    const customerCheck = validateCustomer({
      fullName: regForm.fullName,
      phone: regForm.phone,
      address: regForm.address
    });
    if (customerCheck.errors.fullName) next.fullName = "Enter your full name.";
    if (customerCheck.errors.phone) next.phone = customerCheck.errors.phone;
    if (customerCheck.errors.address) next.address = customerCheck.errors.address;

    if (!regForm.password) next.password = "Enter a password.";
    else if (regForm.password.length < 12) next.password = "Use at least 12 characters.";
    else if (regForm.password.length > 128) next.password = "Use no more than 128 characters.";

    if (!regForm.confirmPassword) next.confirmPassword = "Confirm your password.";
    else if (regForm.confirmPassword !== regForm.password) next.confirmPassword = "The passwords do not match.";

    if (Object.values(next).some(Boolean)) {
      setRegErrors(next);
      focusFirstRegError(next);
      return;
    }

    setRegErrors(EMPTY_REGISTER_ERRORS);
    setSubmitting(true);
    try {
      await onRegister({
        username: cleanUsername,
        fullName: customerCheck.values.fullName,
        phone: customerCheck.values.phone,
        address: customerCheck.values.address,
        password: regForm.password
      });
      setRegForm(EMPTY_REGISTER_FORM);
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      const nextServerErrors = {
        ...EMPTY_REGISTER_ERRORS,
        username: fields.username ?? "",
        fullName: fields.fullName ?? "",
        phone: fields.phone ?? "",
        address: fields.address ?? "",
        password: fields.password ?? "",
        form: error instanceof ApiError ? error.message : "Registration could not be completed. Try again."
      };
      setRegErrors(nextServerErrors);
      focusFirstRegError(nextServerErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const isChecking = status === "checking";
  const isConnectionError = status === "error";

  return (
    <main className="auth-screen">
      <header className="auth-brand-lockup">
        <span>Torque<span className="brand-accent">Pro</span></span>
      </header>

      <div className="auth-entry-panel">
        <div className="auth-card">
          {isChecking && (
            <div className="auth-state" role="status">
              <div className="auth-loading-line" aria-hidden="true" />
              <h1>Checking your session</h1>
            </div>
          )}

          {isConnectionError && (
            <div className="auth-state auth-error-state" role="alert">
              <span className="auth-state-symbol" aria-hidden="true">!</span>
              <h1>Cannot connect to TorquePro</h1>
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

          {!isChecking && !isConnectionError && mode === "login" && (
            <>
              <div className="auth-card-heading">
                <h1>Sign in</h1>
                <p>Use your TorquePro staff, admin, or customer account.</p>
              </div>
              {errorMessage && <p className="auth-field-help mb-4" role="status">{errorMessage}</p>}
              <form noValidate onSubmit={handleLoginSubmit}>
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
              <div className="auth-sign-in-help">
                {onRegister && (
                  <div className="auth-switch-row">
                    <span>New customer?</span>
                    <button type="button" className="auth-switch-button" disabled={working} onClick={() => switchMode("register")}>
                      Create customer account
                    </button>
                  </div>
                )}
                <p>Staff password reset? Ask your workshop admin.</p>
                <button type="button" className="auth-settings-link" disabled={working} onClick={onOpenSettings}>
                  API settings
                </button>
              </div>
            </>
          )}

          {!isChecking && !isConnectionError && mode === "register" && (
            <>
              <div className="auth-card-heading">
                <h1>Create customer account</h1>
                <p>Register to manage your vehicles, book workshop visits, and download service receipts.</p>
              </div>
              <form ref={regFormRef} noValidate onSubmit={handleRegisterSubmit}>
                {regErrors.form && <p className="auth-form-error" role="alert">{regErrors.form}</p>}

                <div className="auth-field">
                  <label htmlFor="register-username">Username</label>
                  <input
                    id="register-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    maxLength={50}
                    value={regForm.username}
                    disabled={working}
                    required
                    aria-invalid={regErrors.username ? "true" : undefined}
                    aria-describedby={regErrors.username ? "register-username-error" : "register-username-help"}
                    onChange={(event) => updateRegField("username", event.target.value)}
                  />
                  <p id="register-username-help" className="auth-field-help">3 to 50 characters (letters, numbers, ., _, -)</p>
                  {regErrors.username && <p id="register-username-error" className="auth-field-error" role="alert">{regErrors.username}</p>}
                </div>

                <div className="auth-field">
                  <label htmlFor="register-full-name">Full name</label>
                  <input
                    id="register-full-name"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    value={regForm.fullName}
                    disabled={working}
                    required
                    aria-invalid={regErrors.fullName ? "true" : undefined}
                    aria-describedby={regErrors.fullName ? "register-full-name-error" : undefined}
                    onChange={(event) => updateRegField("fullName", event.target.value)}
                  />
                  {regErrors.fullName && <p id="register-full-name-error" className="auth-field-error" role="alert">{regErrors.fullName}</p>}
                </div>

                <div className="auth-field">
                  <label htmlFor="register-phone">Phone number</label>
                  <input
                    id="register-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="e.g. 012-345 6789"
                    value={regForm.phone}
                    disabled={working}
                    required
                    aria-invalid={regErrors.phone ? "true" : undefined}
                    aria-describedby={regErrors.phone ? "register-phone-error" : undefined}
                    onChange={(event) => updateRegField("phone", event.target.value)}
                  />
                  {regErrors.phone && <p id="register-phone-error" className="auth-field-error" role="alert">{regErrors.phone}</p>}
                </div>

                <div className="auth-field">
                  <label htmlFor="register-address">Address (optional)</label>
                  <textarea
                    id="register-address"
                    name="address"
                    maxLength={500}
                    value={regForm.address}
                    disabled={working}
                    aria-invalid={regErrors.address ? "true" : undefined}
                    aria-describedby={regErrors.address ? "register-address-error" : undefined}
                    onChange={(event) => updateRegField("address", event.target.value)}
                  />
                  {regErrors.address && <p id="register-address-error" className="auth-field-error" role="alert">{regErrors.address}</p>}
                </div>

                <PasswordField
                  id="register-password"
                  name="password"
                  label="Password"
                  autoComplete="new-password"
                  help="Use 12 to 128 characters."
                  value={regForm.password}
                  error={regErrors.password}
                  visible={showRegPassword}
                  disabled={working}
                  onChange={(value) => updateRegField("password", value)}
                  onToggle={() => setShowRegPassword((value) => !value)}
                />

                <PasswordField
                  id="register-confirm-password"
                  name="confirmPassword"
                  label="Confirm password"
                  autoComplete="new-password"
                  value={regForm.confirmPassword}
                  error={regErrors.confirmPassword}
                  visible={showRegConfirm}
                  disabled={working}
                  onChange={(value) => updateRegField("confirmPassword", value)}
                  onToggle={() => setShowRegConfirm((value) => !value)}
                />

                <button type="submit" className="button button-primary auth-submit" disabled={working}>
                  {working ? "Creating account..." : "Create account"}
                </button>
              </form>
              <div className="auth-sign-in-help">
                <div className="auth-switch-row">
                  <span>Already have an account?</span>
                  <button type="button" className="auth-switch-button" disabled={working} onClick={() => switchMode("login")}>
                    Back to sign in
                  </button>
                </div>
                <button type="button" className="auth-settings-link" disabled={working} onClick={onOpenSettings}>
                  API settings
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
