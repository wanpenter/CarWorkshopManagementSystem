import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getProblemFieldErrors } from "../api.js";
import { FormError, MobileDatum, StatePanel, TableCell, TableHead } from "./Shared.jsx";

const NEW_USER = Object.freeze({ username: "", fullName: "", password: "", confirmPassword: "", role: "Staff", isActive: true });
const EMPTY_ERRORS = Object.freeze({ username: "", fullName: "", password: "", confirmPassword: "", role: "", isActive: "" });

function accountStatus(user) {
  return user.isActive === false ? "Inactive" : "Active";
}

function friendlyDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" }).format(date);
}

export default function UsersSection({ active, currentUser, api, onSessionExpired }) {
  const [users, setUsers] = useState([]);
  const [loadStatus, setLoadStatus] = useState("idle");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(NEW_USER);
  const [errors, setErrors] = useState(EMPTY_ERRORS);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  const editorRef = useRef(null);
  const formRef = useRef(null);
  const resetRef = useRef(null);
  const loadAbortRef = useRef(null);

  const editing = selectedId !== null;
  const selectedUser = useMemo(() => users.find((user) => Number(user.id) === Number(selectedId)) ?? null, [selectedId, users]);
  const editingSelf = Boolean(selectedUser && Number(selectedUser.id) === Number(currentUser?.id));
  const actionBusy = saving || resetting;

  const handleApiError = useCallback((error, fallback) => {
    if (error?.status === 401) {
      onSessionExpired?.();
      return "";
    }
    return error instanceof ApiError ? error.message : fallback;
  }, [onSessionExpired]);

  const loadUsers = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoadStatus("loading");
    setLoadError("");
    try {
      const result = await api.getUsers({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setUsers(Array.isArray(result) ? result : []);
      setLoadStatus("ready");
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      const message = handleApiError(error, "User accounts could not be loaded. Try again.");
      if (message) {
        setLoadError(message);
        setLoadStatus("error");
      }
    } finally {
      if (loadAbortRef.current === controller) loadAbortRef.current = null;
    }
  }, [api, handleApiError]);

  useEffect(() => {
    loadAbortRef.current?.abort();
    setLoadStatus("idle");
    setUsers([]);
    setSelectedId(null);
    setForm(NEW_USER);
  }, [api]);

  useEffect(() => {
    if (active && loadStatus === "idle") loadUsers();
  }, [active, loadStatus, loadUsers]);

  useEffect(() => {
    if (active) return undefined;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setLoadStatus((current) => current === "loading" ? "idle" : current);
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    setResetPassword("");
    setConfirmResetPassword("");
    setResetError("");
    return undefined;
  }, [active]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (!showInactive && user.isActive === false) return false;
      if (!needle) return true;
      return [user.username, user.fullName, user.role].some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [query, showInactive, users]);

  function clearSensitiveFields() {
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    setResetPassword("");
    setConfirmResetPassword("");
  }

  function beginCreate() {
    setSelectedId(null);
    setForm(NEW_USER);
    setErrors(EMPTY_ERRORS);
    setFormError("");
    setResetError("");
    setNotice("");
    clearSensitiveFields();
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => formRef.current?.elements.namedItem("username")?.focus());
  }

  function beginEdit(user) {
    setSelectedId(user.id);
    setForm({
      username: user.username ?? "",
      fullName: user.fullName ?? "",
      password: "",
      confirmPassword: "",
      role: user.role ?? "Staff",
      isActive: user.isActive !== false
    });
    setErrors(EMPTY_ERRORS);
    setFormError("");
    setResetError("");
    setNotice("");
    setResetPassword("");
    setConfirmResetPassword("");
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => formRef.current?.elements.namedItem("fullName")?.focus());
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setFormError("");
    setNotice("");
  }

  function validateUser() {
    const next = { ...EMPTY_ERRORS };
    const username = form.username.trim();
    const fullName = form.fullName.trim();
    if (!editing) {
      if (!username) next.username = "Enter a username.";
      else if (username.length < 3 || username.length > 50) next.username = "Use 3 to 50 characters.";
      else if (!/^[A-Za-z0-9._-]+$/.test(username)) next.username = "Use letters, numbers, periods, underscores, or hyphens only.";
    }
    if (!fullName) next.fullName = "Enter the staff member's full name.";
    else if (fullName.length > 100) next.fullName = "Full name must be 100 characters or fewer.";
    if (!editing) {
      if (!form.password) next.password = "Enter a temporary password.";
      else if (form.password.length < 12) next.password = "Use at least 12 characters.";
      else if (form.password.length > 128) next.password = "Use no more than 128 characters.";
      if (!form.confirmPassword) next.confirmPassword = "Confirm the temporary password.";
      else if (form.confirmPassword !== form.password) next.confirmPassword = "The passwords do not match.";
    }
    if (!["Admin", "Staff"].includes(form.role)) next.role = "Choose a valid role.";
    return { next, username, fullName };
  }

  function focusFirstUserError(next) {
    const first = ["username", "fullName", "password", "confirmPassword", "role"].find((name) => next[name]);
    if (first) formRef.current?.elements.namedItem(first)?.focus();
  }

  async function handleSave(event) {
    event.preventDefault();
    if (actionBusy) return;
    const { next, username, fullName } = validateUser();
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      focusFirstUserError(next);
      return;
    }

    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      if (editing) {
        const updated = await api.updateUser(selectedId, { fullName, role: form.role, isActive: form.isActive });
        setUsers((current) => current.map((user) => Number(user.id) === Number(selectedId) ? updated : user));
        setForm((current) => ({ ...current, fullName: updated.fullName, role: updated.role, isActive: updated.isActive !== false }));
        setNotice("Account changes saved.");
      } else {
        const created = await api.addUser({ username, fullName, password: form.password, role: form.role, isActive: form.isActive });
        setUsers((current) => [...current, created]);
        setSelectedId(created.id);
        setForm({ username: created.username, fullName: created.fullName, password: "", confirmPassword: "", role: created.role, isActive: created.isActive !== false });
        setNotice("User account created.");
      }
      clearSensitiveFields();
      setErrors(EMPTY_ERRORS);
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      const nextErrors = {
        username: fields.username ?? "",
        fullName: fields.fullName ?? "",
        password: fields.password ?? "",
        confirmPassword: fields.confirmPassword ?? "",
        role: fields.role ?? "",
        isActive: fields.isActive ?? ""
      };
      setErrors(nextErrors);
      setFormError(handleApiError(error, "The account could not be saved. Try again."));
      focusFirstUserError(nextErrors);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    if (!selectedUser || editingSelf || actionBusy) return;
    let message = "";
    if (!resetPassword) message = "Enter a new password.";
    else if (resetPassword.length < 12) message = "Use at least 12 characters.";
    else if (resetPassword.length > 128) message = "Use no more than 128 characters.";
    else if (!confirmResetPassword) message = "Confirm the new password.";
    else if (confirmResetPassword !== resetPassword) message = "The passwords do not match.";
    if (message) {
      setResetError(message);
      resetRef.current?.elements.namedItem(!resetPassword ? "resetPassword" : "confirmResetPassword")?.focus();
      return;
    }

    setResetting(true);
    setResetError("");
    setNotice("");
    try {
      await api.resetUserPassword(selectedUser.id, resetPassword);
      setResetPassword("");
      setConfirmResetPassword("");
      setNotice(`Password reset for ${selectedUser.username}. Their active sessions have been signed out.`);
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setResetError(fields.newPassword ?? fields.password ?? handleApiError(error, "The password could not be reset. Try again."));
    } finally {
      setResetting(false);
    }
  }

  if (!active) return null;

  return (
    <section className="workspace-grid users-workspace" aria-labelledby="users-title">
      <article className="records-panel">
        <div className="records-heading">
          <div>
            <h1 id="users-title" className="page-title" tabIndex={-1}>User accounts</h1>
            <p className="text-ink-soft">Create staff access, update roles, and manage account status.</p>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" className="button button-secondary" disabled={actionBusy || loadStatus === "loading"} onClick={loadUsers}>Reload accounts</button><button type="button" className="button button-primary" disabled={actionBusy} onClick={beginCreate}>Add user</button></div>
        </div>

        {loadStatus === "loading" && <StatePanel compact loading title="Loading users" body="Getting the latest account list." />}
        {loadStatus === "error" && (
          <StatePanel compact error title="Users could not be loaded" body={loadError}>
            <button type="button" className="button button-secondary" onClick={loadUsers}>Try again</button>
          </StatePanel>
        )}

        {loadStatus === "ready" && (
          <>
            <div className="users-filters">
              <div>
                <label htmlFor="users-search">Search users</label>
                <input id="users-search" className="control-input" type="search" value={query} placeholder="Name, username, or role" onChange={(event) => setQuery(event.target.value)} />
              </div>
              <label className="auth-checkbox" htmlFor="users-show-inactive">
                <input id="users-show-inactive" type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
                Show inactive accounts
              </label>
            </div>

            {users.length === 0 ? (
              <StatePanel compact title="No user accounts found" body="Create a user account to give a staff member access." />
            ) : visibleUsers.length === 0 ? (
              <StatePanel compact title="No matching users" body="Try another search or include inactive accounts." />
            ) : (
              <>
                <div className="hidden overflow-x-auto desk:block">
                  <table className="w-full border-collapse">
                    <thead><tr><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-24">Action</TableHead></tr></thead>
                    <tbody>
                      {visibleUsers.map((user) => (
                        <tr key={user.id} className={Number(user.id) === Number(selectedId) ? "bg-selected" : ""}>
                          <TableCell><strong className="block">{user.fullName}</strong><span className="text-ink-soft">{user.username}</span></TableCell>
                          <TableCell>{user.role}</TableCell>
                          <TableCell><span className={`status-text ${user.isActive === false ? "text-ink-soft" : "text-success"}`}>{accountStatus(user)}</span></TableCell>
                          <TableCell>{friendlyDate(user.createdAtUtc)}</TableCell>
                          <TableCell><button type="button" className="row-action" disabled={actionBusy} onClick={() => beginEdit(user)}>Edit</button></TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 desk:hidden">
                  {visibleUsers.map((user) => (
                    <article key={user.id} className={`record-card ${Number(user.id) === Number(selectedId) ? "border-rust bg-selected" : "border-paper-line bg-white"}`}>
                      <MobileDatum label="User"><strong>{user.fullName}</strong><br /><span className="text-ink-soft">{user.username}</span></MobileDatum>
                      <MobileDatum label="Role">{user.role}</MobileDatum>
                      <MobileDatum label="Status">{accountStatus(user)}</MobileDatum>
                      <MobileDatum label="Created">{friendlyDate(user.createdAtUtc)}</MobileDatum>
                      <button type="button" className="button button-secondary mt-3 w-full" disabled={actionBusy} onClick={() => beginEdit(user)}>Edit account</button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </article>

      <aside ref={editorRef} className="editor-panel" aria-labelledby="user-editor-title">
        <div className="mb-7">
          <h2 id="user-editor-title" className="editor-title">{editing ? form.username : "Add a user"}</h2>
          <p className="mt-2 text-ink-soft">{editing ? "Update this user's profile and access." : "Create credentials for an authorised staff member."}</p>
        </div>

        {notice && <p className="auth-success-notice" role="status">{notice}</p>}
        <form ref={formRef} noValidate onSubmit={handleSave}>
          <FormError message={formError} />

          <div className="auth-field">
            <label htmlFor="user-editor-username">Username</label>
            <input id="user-editor-username" name="username" className="control-input" value={form.username} readOnly={editing} disabled={actionBusy} autoComplete="off" aria-invalid={errors.username ? "true" : undefined} aria-describedby={errors.username ? "user-editor-username-error" : editing ? "user-editor-username-help" : undefined} onChange={(event) => updateField("username", event.target.value)} />
            {editing && <p id="user-editor-username-help" className="auth-field-help">Usernames cannot be changed.</p>}
            {errors.username && <p id="user-editor-username-error" className="auth-field-error" role="alert">{errors.username}</p>}
          </div>

          <div className="auth-field">
            <label htmlFor="user-editor-full-name">Full name</label>
            <input id="user-editor-full-name" name="fullName" className="control-input" value={form.fullName} maxLength={100} disabled={actionBusy} autoComplete="off" aria-invalid={errors.fullName ? "true" : undefined} aria-describedby={errors.fullName ? "user-editor-full-name-error" : undefined} onChange={(event) => updateField("fullName", event.target.value)} />
            {errors.fullName && <p id="user-editor-full-name-error" className="auth-field-error" role="alert">{errors.fullName}</p>}
          </div>

          {!editing && (
            <>
              <div className="auth-field">
                <label htmlFor="user-editor-password">Password</label>
                <input id="user-editor-password" name="password" className="control-input" type="password" minLength={12} maxLength={128} value={form.password} disabled={actionBusy} autoComplete="new-password" aria-invalid={errors.password ? "true" : undefined} aria-describedby={errors.password ? "user-editor-password-error" : "user-editor-password-help"} onChange={(event) => updateField("password", event.target.value)} />
                <p id="user-editor-password-help" className="auth-field-help">Use 12 to 128 characters.</p>
                {errors.password && <p id="user-editor-password-error" className="auth-field-error" role="alert">{errors.password}</p>}
              </div>
              <div className="auth-field">
                <label htmlFor="user-editor-confirm-password">Confirm password</label>
                <input id="user-editor-confirm-password" name="confirmPassword" className="control-input" type="password" minLength={12} maxLength={128} value={form.confirmPassword} disabled={actionBusy} autoComplete="new-password" aria-invalid={errors.confirmPassword ? "true" : undefined} aria-describedby={errors.confirmPassword ? "user-editor-confirm-password-error" : undefined} onChange={(event) => updateField("confirmPassword", event.target.value)} />
                {errors.confirmPassword && <p id="user-editor-confirm-password-error" className="auth-field-error" role="alert">{errors.confirmPassword}</p>}
              </div>
            </>
          )}

          <div className="auth-field">
            <label htmlFor="user-editor-role">Role</label>
            <select id="user-editor-role" name="role" className="control-input" value={form.role} disabled={actionBusy || editingSelf} aria-invalid={errors.role ? "true" : undefined} aria-describedby={editingSelf ? "user-editor-role-help" : errors.role ? "user-editor-role-error" : undefined} onChange={(event) => updateField("role", event.target.value)}>
              <option value="Staff">Staff</option>
              <option value="Admin">Admin</option>
            </select>
            {editingSelf && <p id="user-editor-role-help" className="auth-field-help">Another administrator must change your role.</p>}
            {errors.role && <p id="user-editor-role-error" className="auth-field-error" role="alert">{errors.role}</p>}
          </div>

          <label className={`auth-checkbox auth-account-toggle ${editingSelf ? "is-disabled" : ""}`} htmlFor="user-editor-active">
            <input id="user-editor-active" name="isActive" type="checkbox" checked={form.isActive} disabled={actionBusy || editingSelf} onChange={(event) => updateField("isActive", event.target.checked)} />
            Active account
          </label>
          {editingSelf && <p className="auth-field-help auth-own-account-help">You cannot deactivate your own account.</p>}
          {errors.isActive && <p className="auth-field-error" role="alert">{errors.isActive}</p>}

          <div className="form-actions auth-editor-actions">
            <button type="submit" className="button button-primary" disabled={actionBusy}>{saving ? "Saving..." : editing ? "Save changes" : "Create user"}</button>
            {editing && <button type="button" className="button button-secondary" disabled={actionBusy} onClick={beginCreate}>Add another</button>}
          </div>
        </form>

        {editing && (
          <section className="auth-reset-section" aria-labelledby="reset-password-title">
            <h3 id="reset-password-title">Reset password</h3>
            {editingSelf ? (
              <p>Use the Account page to change your own password.</p>
            ) : (
              <form ref={resetRef} noValidate onSubmit={handleResetPassword}>
                <p>Resetting this password signs out the user's active sessions.</p>
                {resetError && <p className="auth-form-error" role="alert">{resetError}</p>}
                <div className="auth-field">
                  <label htmlFor="user-reset-password">New password</label>
                  <input id="user-reset-password" name="resetPassword" className="control-input" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={resetPassword} disabled={actionBusy} onChange={(event) => { setResetPassword(event.target.value); setResetError(""); }} />
                </div>
                <div className="auth-field">
                  <label htmlFor="user-reset-confirm-password">Confirm new password</label>
                  <input id="user-reset-confirm-password" name="confirmResetPassword" className="control-input" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={confirmResetPassword} disabled={actionBusy} onChange={(event) => { setConfirmResetPassword(event.target.value); setResetError(""); }} />
                </div>
                <button type="submit" className="button button-secondary auth-full-button" disabled={actionBusy}>{resetting ? "Resetting..." : "Reset password"}</button>
              </form>
            )}
          </section>
        )}
      </aside>
    </section>
  );
}
