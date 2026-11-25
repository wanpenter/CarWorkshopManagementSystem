import { useEffect, useRef, useState } from "react";
import { ApiError, getProblemFieldErrors, validateCustomer } from "../api.js";
import { WORKSHOP_PROFILE } from "../workshopProfile.js";
import torqueProLogo from "../assets/torquepro-logo-light.png";

const EMPTY_LOGIN_ERRORS = Object.freeze({ username: "", password: "", form: "", recoveryHint: "" });
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

function UserIcon({ className = "auth-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function LockIcon({ className = "auth-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ShieldIcon({ className = "auth-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8 3.7-3.8" />
    </svg>
  );
}

function PasswordField({
  id,
  name = "password",
  label = "Password",
  autoComplete = "current-password",
  inputRef,
  value,
  error,
  help,
  statusText,
  statusTone = "neutral",
  visible,
  disabled,
  onChange,
  onToggle
}) {
  const describedBy = [
    help ? `${id}-help` : null,
    statusText ? `${id}-status` : null,
    error ? `${id}-error` : null
  ].filter(Boolean).join(" ") || undefined;

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
      {statusText && (
        <p id={`${id}-status`} className={`auth-field-status is-${statusTone}`} aria-live="polite">
          {statusText}
        </p>
      )}
      {error && <p id={`${id}-error`} className="auth-field-error">{error}</p>}
    </div>
  );
}

export default function LoginScreen({
  portal = "customer",
  status,
  errorMessage,
  busy = false,
  onLogin,
  onRegister,
  onSwitchPortal,
  onRetry,
  onOpenSettings
}) {
  const isStaffPortal = portal === "staff";
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
  const loginAlertRef = useRef(null);
  const regFormRef = useRef(null);
  const regAlertRef = useRef(null);

  const working = busy || submitting;
  const isChecking = status === "checking";
  const isConnectionError = status === "error";
  const effectiveMode = isStaffPortal ? "login" : mode;

  useEffect(() => {
    setMode("login");
    setErrors(EMPTY_LOGIN_ERRORS);
    setRegErrors(EMPTY_REGISTER_ERRORS);
    setPassword("");
    setShowPassword(false);
  }, [portal]);

  useEffect(() => {
    if (isChecking || isConnectionError || effectiveMode !== "login") return;
    if (typeof window === "undefined" || !window.matchMedia?.("(min-width: 50rem) and (pointer: fine)").matches) return;
    const active = document.activeElement;
    if (!active || active === document.body || active.classList.contains("auth-nav-tab")) {
      usernameRef.current?.focus({ preventScroll: true });
    }
  }, [portal, effectiveMode, isChecking, isConnectionError]);

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

  function focusSegmentInput(event, inputRef) {
    if (event.target.closest("button, input, a")) return;
    inputRef.current?.focus();
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
      const isUnauthorized = error instanceof ApiError && error.status === 401;
      const recoveryHint = isUnauthorized
        ? isStaffPortal
          ? "Check your staff login, or ask an admin for a reset."
          : "Check your login, confirm the Customer tab, or wait 15 minutes if locked."
        : "";
      const next = {
        username: fields.username ?? "",
        password: fields.password ?? "",
        form: error instanceof ApiError ? error.message : "Could not sign in. Try again.",
        recoveryHint
      };
      setErrors(next);
      if (next.username) usernameRef.current?.focus();
      else if (next.password) passwordRef.current?.focus();
      else window.requestAnimationFrame(() => loginAlertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  function focusFirstRegError(next) {
    const first = ["fullName", "phone", "address", "username", "password", "confirmPassword"].find((name) => next[name]);
    if (first) regFormRef.current?.elements.namedItem(first)?.focus();
    else if (next.form) window.requestAnimationFrame(() => regAlertRef.current?.focus());
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (working || !onRegister) return;

    const next = { ...EMPTY_REGISTER_ERRORS };
    const cleanUsername = regForm.username.trim();
    if (!cleanUsername) next.username = "Enter a username.";
    else if (cleanUsername.length < 3 || cleanUsername.length > 50) next.username = "Use 3–50 characters.";
    else if (!/^[A-Za-z0-9._-]+$/.test(cleanUsername)) next.username = "Letters, numbers, . _ - only.";

    const customerCheck = validateCustomer({
      fullName: regForm.fullName,
      phone: regForm.phone,
      address: regForm.address
    });
    if (customerCheck.errors.fullName) {
      next.fullName = regForm.fullName.trim() ? "Max 100 characters." : "Enter your full name.";
    }
    if (customerCheck.errors.phone) {
      next.phone = regForm.phone.trim() ? "Max 20 characters." : "Enter your phone number.";
    }
    if (customerCheck.errors.address) {
      next.address = "Max 500 characters.";
    }

    if (!regForm.password) next.password = "Enter a password.";
    else if (regForm.password.length < 12) next.password = "At least 12 characters.";
    else if (regForm.password.length > 128) next.password = "Max 128 characters.";

    if (!regForm.confirmPassword) next.confirmPassword = "Confirm your password.";
    else if (regForm.confirmPassword !== regForm.password) next.confirmPassword = "Passwords do not match.";

    if (Object.values(next).some(Boolean)) {
      next.form = "Fix the highlighted fields.";
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
        form: error instanceof ApiError ? error.message : "Could not create account. Try again."
      };
      setRegErrors(nextServerErrors);
      focusFirstRegError(nextServerErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const passwordLength = regForm.password.length;
  const passwordStatusText = passwordLength === 0
    ? "At least 12 characters"
    : passwordLength < 12
      ? `${passwordLength} / 12 characters`
      : passwordLength > 128
        ? `${passwordLength} / 128 max`
        : `${passwordLength} characters — OK`;
  const passwordStatusTone = passwordLength === 0
    ? "neutral"
    : passwordLength >= 12 && passwordLength <= 128
      ? "ok"
      : "warn";

  const confirmStatusText = regForm.confirmPassword.length === 0
    ? ""
    : regForm.confirmPassword === regForm.password
      ? "Matches"
      : "Does not match yet";
  const confirmStatusTone = regForm.confirmPassword === regForm.password ? "ok" : "warn";

  return (
    <div className={`auth-screen ${isStaffPortal ? "is-staff" : "is-customer"}`}>
      <a className="skip-link" href="#main-content">
        {effectiveMode === "register" ? "Skip to registration" : "Skip to sign in"}
      </a>

      <header className="auth-navbar">
        <div className="auth-navbar-brand">
          <span className="auth-wordmark">
            Torque<span className="auth-wordmark-accent">Pro</span>
          </span>
          <span className="auth-wordmark-divider" aria-hidden="true" />
          <img
            src={torqueProLogo}
            alt=""
            aria-hidden="true"
            className="auth-brand-logo"
          />
        </div>

        <div className="auth-navbar-right">
          {onSwitchPortal && (
            <nav className="auth-portal-tabs" aria-label="Portal navigation">
              <button
                type="button"
                className={`auth-nav-tab ${!isStaffPortal ? "is-active" : ""}`}
                aria-current={!isStaffPortal ? "page" : undefined}
                disabled={working}
                onClick={() => onSwitchPortal("customer")}
              >
                Customer
              </button>
              <button
                type="button"
                className={`auth-nav-tab ${isStaffPortal ? "is-active" : ""}`}
                aria-current={isStaffPortal ? "page" : undefined}
                disabled={working}
                onClick={() => onSwitchPortal("staff")}
              >
                Staff &amp; Admin
              </button>
            </nav>
          )}

          {isStaffPortal && (
            <span className="auth-nav-internal-pill">
              <ShieldIcon className="auth-nav-shield-icon" />
              <span>Internal</span>
            </span>
          )}
        </div>
      </header>

      <main id="main-content" className="auth-entry-panel" tabIndex={-1}>
        {isChecking && (
          <div className="auth-card">
            <div className="auth-state" role="status">
              <div className="auth-loading-line" aria-hidden="true" />
              <h1>Checking session...</h1>
              <p>Please wait.</p>
            </div>
          </div>
        )}

        {isConnectionError && (
          <div className="auth-card">
            <div className="auth-state" role="alert">
              <span className="auth-state-symbol" aria-hidden="true">!</span>
              <h1>Cannot connect</h1>
              <p>
                {isStaffPortal
                  ? (errorMessage || "Workshop API is unreachable. Check the server and try again.")
                  : "Service is unreachable. Try again shortly."}
              </p>
              <div className="auth-actions">
                <button type="button" className="button button-primary" disabled={busy} onClick={onRetry}>
                  {busy ? "Trying again..." : "Try again"}
                </button>
                {isStaffPortal && (
                  <button type="button" className="button button-secondary" disabled={busy} onClick={onOpenSettings}>
                    API settings
                  </button>
                )}
              </div>
              {!isStaffPortal && (
                <details className="auth-tech-details">
                  <summary>Connection details</summary>
                  {errorMessage && <p className="auth-tech-message">{errorMessage}</p>}
                  <button type="button" className="button button-secondary" disabled={busy} onClick={onOpenSettings}>
                    API settings
                  </button>
                </details>
              )}
            </div>
          </div>
        )}

        {!isChecking && !isConnectionError && effectiveMode === "login" && (
          <section className="auth-hero-stage" aria-labelledby="auth-hero-title">
            <h1 id="auth-hero-title" className="auth-hero-headline">
              {isStaffPortal ? "Staff Sign In" : "Car Service, Without the Wait."}
            </h1>
            <p className="auth-hero-subtitle">
              {isStaffPortal
                ? "Authorised staff only. Sign-ins are logged."
                : "Pick a slot, track your repair, and get receipts anytime."}
            </p>

            {errorMessage && (
              <p className="auth-hero-notice" role="status">
                {errorMessage}
              </p>
            )}

            {errors.form && (
              <div ref={loginAlertRef} tabIndex={-1} className="auth-hero-alert" role="alert">
                <p className="auth-hero-alert-title">{errors.form}</p>
                {errors.recoveryHint && <p className="auth-hero-alert-hint">{errors.recoveryHint}</p>}
              </div>
            )}

            <form className="auth-login-bar" noValidate onSubmit={handleLoginSubmit}>
              <div
                className={`auth-bar-segment ${errors.username ? "has-error" : ""}`}
                onClick={(event) => focusSegmentInput(event, usernameRef)}
              >
                <span className="auth-bar-icon" aria-hidden="true">
                  <UserIcon />
                </span>
                <div className="auth-bar-input-wrap">
                  <label htmlFor="login-username" className="auth-bar-label">Username</label>
                  <input
                    ref={usernameRef}
                    id="login-username"
                    name="username"
                    type="text"
                    placeholder={isStaffPortal ? "Staff username" : "Your username"}
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
                      if (errors.username || errors.form) setErrors((current) => ({ ...current, username: "", form: "", recoveryHint: "" }));
                    }}
                  />
                  {errors.username && (
                    <p id="login-username-error" className="auth-bar-error" role="alert">
                      {errors.username}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`auth-bar-segment ${errors.password ? "has-error" : ""}`}
                onClick={(event) => focusSegmentInput(event, passwordRef)}
              >
                <span className="auth-bar-icon" aria-hidden="true">
                  <LockIcon />
                </span>
                <div className="auth-bar-input-wrap">
                  <label htmlFor="login-password" className="auth-bar-label">Password</label>
                  <div className="auth-bar-password-row">
                    <input
                      ref={passwordRef}
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      value={password}
                      disabled={working}
                      required
                      aria-invalid={errors.password ? "true" : undefined}
                      aria-describedby={errors.password ? "login-password-error" : undefined}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (errors.password || errors.form) setErrors((current) => ({ ...current, password: "", form: "", recoveryHint: "" }));
                      }}
                    />
                    <button
                      type="button"
                      className="auth-bar-toggle"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      disabled={working}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="login-password-error" className="auth-bar-error" role={!errors.username ? "alert" : undefined}>
                      {errors.password}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className={`auth-bar-submit ${isStaffPortal ? "is-staff" : "is-customer"}`}
                disabled={working}
              >
                <span>{working ? "Signing in..." : "Sign in"}</span>
              </button>
            </form>

            <div className="auth-hero-subactions">
              {!isStaffPortal && onRegister ? (
                <>
                  <button
                    type="button"
                    className="auth-secondary-cta"
                    disabled={working}
                    onClick={() => switchMode("register")}
                  >
                    New customer? Create an account
                  </button>
                  <p className="auth-hero-help">
                    Forgot password? Call <strong>{WORKSHOP_PROFILE.phone}</strong>.
                  </p>
                </>
              ) : (
                <p className="auth-hero-help">
                  Forgot password or need access? Ask your admin.
                </p>
              )}
            </div>
          </section>
        )}

        {!isChecking && !isConnectionError && effectiveMode === "register" && (
          <div className="auth-card auth-register-card">
            <div className="auth-card-heading">
              <h1>Create account</h1>
              <p>Enter your details to start booking.</p>
            </div>
            <form ref={regFormRef} noValidate onSubmit={handleRegisterSubmit}>
              {regErrors.form && (
                <p ref={regAlertRef} tabIndex={-1} className="auth-form-error" role="alert">
                  {regErrors.form}
                </p>
              )}

              <fieldset className="auth-register-group">
                <legend>Contact details</legend>
                <div className="auth-register-grid">
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
                    {regErrors.fullName && <p id="register-full-name-error" className="auth-field-error">{regErrors.fullName}</p>}
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
                    {regErrors.phone && <p id="register-phone-error" className="auth-field-error">{regErrors.phone}</p>}
                  </div>

                  <div className="auth-field auth-field-span">
                    <label htmlFor="register-address">Address (optional)</label>
                    <input
                      id="register-address"
                      name="address"
                      type="text"
                      autoComplete="street-address"
                      maxLength={500}
                      placeholder="Street, city, postcode"
                      value={regForm.address}
                      disabled={working}
                      aria-invalid={regErrors.address ? "true" : undefined}
                      aria-describedby={regErrors.address ? "register-address-error" : undefined}
                      onChange={(event) => updateRegField("address", event.target.value)}
                    />
                    {regErrors.address && <p id="register-address-error" className="auth-field-error">{regErrors.address}</p>}
                  </div>
                </div>
              </fieldset>

              <fieldset className="auth-register-group">
                <legend>Login details</legend>
                <div className="auth-register-grid">
                  <div className="auth-field auth-field-span">
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
                      aria-describedby={
                        ["register-username-help", regErrors.username ? "register-username-error" : null]
                          .filter(Boolean)
                          .join(" ")
                      }
                      onChange={(event) => updateRegField("username", event.target.value)}
                    />
                    <p id="register-username-help" className="auth-field-help">
                      3–50 characters (letters, numbers, . _ -)
                    </p>
                    {regErrors.username && <p id="register-username-error" className="auth-field-error">{regErrors.username}</p>}
                  </div>

                  <PasswordField
                    id="register-password"
                    name="password"
                    label="Password"
                    autoComplete="new-password"
                    statusText={passwordStatusText}
                    statusTone={passwordStatusTone}
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
                    statusText={confirmStatusText}
                    statusTone={confirmStatusTone}
                    value={regForm.confirmPassword}
                    error={regErrors.confirmPassword}
                    visible={showRegConfirm}
                    disabled={working}
                    onChange={(value) => updateRegField("confirmPassword", value)}
                    onToggle={() => setShowRegConfirm((value) => !value)}
                  />
                </div>
              </fieldset>

              <button type="submit" className="button auth-register-submit auth-submit" disabled={working}>
                {working ? "Creating account..." : "Create account"}
              </button>
            </form>

            <div className="auth-sign-in-help">
              <div className="auth-switch-row">
                <span>Have an account?</span>
                <button type="button" className="auth-switch-button" disabled={working} onClick={() => switchMode("login")}>
                  Back to sign in
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="auth-footer">
        <div className="auth-footer-meta">
          <strong>{WORKSHOP_PROFILE.name}</strong>
          <span>{WORKSHOP_PROFILE.address}</span>
          <span>08:30–17:30 MYT</span>
        </div>
        {isStaffPortal && (
          <div className="auth-footer-controls">
            <button type="button" className="auth-footer-link" disabled={working} onClick={onOpenSettings}>
              API settings
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
