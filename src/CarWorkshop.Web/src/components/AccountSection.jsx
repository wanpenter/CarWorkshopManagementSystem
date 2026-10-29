import { useEffect, useRef, useState } from "react";
import { ApiError, getProblemFieldErrors } from "../api.js";
import { FormError } from "./Shared.jsx";

const EMPTY_VALUES = Object.freeze({ currentPassword: "", newPassword: "", confirmPassword: "" });
const EMPTY_ERRORS = Object.freeze({ currentPassword: "", newPassword: "", confirmPassword: "" });

function AccountPasswordField({ id, name, label, value, error, autoComplete, disabled, visible, onChange, onToggle }) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={id === "account-current-password" ? undefined : 12}
          maxLength={128}
          value={value}
          disabled={disabled}
          required
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
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

export default function AccountSection({ active, user, busy = false, onChangePassword }) {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState(EMPTY_ERRORS);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const formRef = useRef(null);
  const working = busy || saving;

  useEffect(() => {
    if (active) return;
    setValues(EMPTY_VALUES);
    setErrors(EMPTY_ERRORS);
    setFormError("");
    setVisible({ currentPassword: false, newPassword: false, confirmPassword: false });
  }, [active]);

  function setValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setFormError("");
  }

  function focusFirstError(nextErrors) {
    const first = ["currentPassword", "newPassword", "confirmPassword"].find((name) => nextErrors[name]);
    if (first) formRef.current?.elements.namedItem(first)?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (working) return;

    const nextErrors = { ...EMPTY_ERRORS };
    if (!values.currentPassword) nextErrors.currentPassword = "Enter your current password.";
    if (!values.newPassword) nextErrors.newPassword = "Enter a new password.";
    else if (values.newPassword.length < 12) nextErrors.newPassword = "Use at least 12 characters.";
    else if (values.newPassword.length > 128) nextErrors.newPassword = "Use no more than 128 characters.";
    if (!values.confirmPassword) nextErrors.confirmPassword = "Confirm your new password.";
    else if (values.confirmPassword !== values.newPassword) nextErrors.confirmPassword = "The passwords do not match.";
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await onChangePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setValues(EMPTY_VALUES);
      setVisible({ currentPassword: false, newPassword: false, confirmPassword: false });
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      const next = {
        currentPassword: fields.currentPassword ?? "",
        newPassword: fields.newPassword ?? fields.password ?? "",
        confirmPassword: fields.confirmPassword ?? ""
      };
      setErrors(next);
      setFormError(error instanceof ApiError ? error.message : "Your password could not be changed. Try again.");
      focusFirstError(next);
    } finally {
      setSaving(false);
    }
  }

  if (!active) return null;

  return (
    <section className="workspace-grid account-workspace" aria-labelledby="account-title">
      <article className="records-panel">
        <div className="records-heading">
          <div>
            <h1 id="account-title" className="page-title" tabIndex={-1}>Your profile</h1>
            <p className="text-ink-soft">Review the account currently signed in to this workshop.</p>
          </div>
          <span className={`auth-status-badge ${user?.isActive === false ? "is-inactive" : ""}`}>
            {user?.isActive === false ? "Inactive" : "Active"}
          </span>
        </div>

        <dl className="account-profile-grid">
          <div><dt>Full name</dt><dd>{user?.fullName || "Not provided"}</dd></div>
          <div><dt>Username</dt><dd>{user?.username || "Not available"}</dd></div>
          <div><dt>Role</dt><dd>{user?.role || "Not available"}</dd></div>
          <div><dt>Account ID</dt><dd>{user?.id ?? "Not available"}</dd></div>
        </dl>
      </article>

      <aside className="editor-panel" aria-labelledby="change-password-title">
        <div className="mb-7">
          <h2 id="change-password-title" className="editor-title">Change password</h2>
          <p className="mt-2 text-ink-soft">Changing your password signs out every active session, including this one. You will sign in again with the new password.</p>
        </div>

        <form ref={formRef} noValidate onSubmit={handleSubmit}>
          <FormError message={formError} />
          <AccountPasswordField
            id="account-current-password"
            name="currentPassword"
            label="Current password"
            value={values.currentPassword}
            error={errors.currentPassword}
            autoComplete="current-password"
            visible={visible.currentPassword}
            disabled={working}
            onChange={(value) => setValue("currentPassword", value)}
            onToggle={() => setVisible((current) => ({ ...current, currentPassword: !current.currentPassword }))}
          />
          <AccountPasswordField
            id="account-new-password"
            name="newPassword"
            label="New password"
            value={values.newPassword}
            error={errors.newPassword}
            autoComplete="new-password"
            visible={visible.newPassword}
            disabled={working}
            onChange={(value) => setValue("newPassword", value)}
            onToggle={() => setVisible((current) => ({ ...current, newPassword: !current.newPassword }))}
          />
          <AccountPasswordField
            id="account-confirm-password"
            name="confirmPassword"
            label="Confirm new password"
            value={values.confirmPassword}
            error={errors.confirmPassword}
            autoComplete="new-password"
            visible={visible.confirmPassword}
            disabled={working}
            onChange={(value) => setValue("confirmPassword", value)}
            onToggle={() => setVisible((current) => ({ ...current, confirmPassword: !current.confirmPassword }))}
          />
          <p className="auth-password-guidance">Use 12 to 128 characters.</p>
          <button type="submit" className="button button-primary auth-full-button" disabled={working}>
            {working ? "Changing password..." : "Change password"}
          </button>
        </form>
      </aside>
    </section>
  );
}
